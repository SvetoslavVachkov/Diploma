const axios = require('axios');
const { analyzeProductsFromReceipt } = require('./productAnalysisService');

const extractJsonObject = (text) => {
  if (!text) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch (e) {
    }
  }

  try {
    return JSON.parse(text);
  } catch (e) {
  }

  return null;
};

const parseReceiptWithAI = async (receiptText, { apiKey, model, useOpenAI = true } = {}) => {
  if (!receiptText) return null;

  const text = String(receiptText);
  const clipped = text.length > 4000 ? text.slice(0, 4000) : text;

  if (useOpenAI && apiKey) {
    try {
      const openaiResult = await analyzeProductsFromReceipt(clipped, apiKey, model || 'gpt-4o-mini');
      
      if (openaiResult && openaiResult.products && openaiResult.products.length > 0) {
        const totalAmount = openaiResult.amount_eur || openaiResult.products.reduce((sum, p) => sum + (p.total_price || 0), 0);
        return {
          merchant: openaiResult.merchant || null,
          amount_eur: totalAmount > 0 ? totalAmount : null,
          date: openaiResult.date || null,
          products: openaiResult.products
        };
      }
    } catch (openaiError) {
    }
  }

  if (!apiKey || !model) return null;

  const prompt = `You are an expert receipt parser.
Extract the MERCHANT name and the TOTAL amount in EUR from the receipt OCR text.

Return ONLY valid JSON (no markdown), with EXACT keys:
{
  "merchant": string,
  "amount_eur": number
}

Rules:
- Prefer the real merchant (e.g. "Domino's Pizza") over printer/terminal brands (ELTRADE, DATECS, FISCAL, POS, TERMINAL).
- If the receipt shows both BGN and EUR, choose the EUR total (often written as "(9.80 EUR)" next to a BGN amount).
- If the receipt shows BGN and ALSO has a smaller number in parentheses without currency (e.g. "19.17 BGN (9.80)"), assume the parentheses value is EUR when ratio BGN/EUR is around 1.7–2.3.
- If only BGN is present and no EUR (explicit or inferred) is shown, set amount_eur to null.

OCR TEXT:
${clipped}`;

  const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

  let response;
  try {
    response = await axios.post(
      HF_ROUTER_URL,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
  } catch (error) {
    const status = error?.response?.status;
    if (status) {
      throw new Error(`Hugging Face inference error ${status} for model "${model}"`);
    }
    throw new Error(`Hugging Face inference request failed for model "${model}": ${error.message}`);
  }

  let outputText = '';
  if (response.data && response.data.choices && response.data.choices[0]) {
    const msg = response.data.choices[0].message;
    outputText = (msg && msg.content) ? msg.content : '';
  }
  if (!outputText) {
    outputText = JSON.stringify(response.data || '');
  }

  const parsed = extractJsonObject(outputText);
  if (!parsed || typeof parsed !== 'object') return null;

  const merchant = String(parsed.merchant || '').trim();
  const amountEur = parsed.amount_eur === null || parsed.amount_eur === undefined ? null : Number(parsed.amount_eur);

  const cleaned = {
    merchant: merchant ? merchant.substring(0, 120) : null,
    amount_eur: Number.isFinite(amountEur) && amountEur > 0 && amountEur < 10000 ? amountEur : null
  };

  if (!cleaned.merchant && cleaned.amount_eur === null) return null;
  return cleaned;
};

module.exports = {
  parseReceiptWithAI
};


