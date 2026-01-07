const axios = require('axios');

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

const parseReceiptWithAI = async (receiptText, { apiKey, model } = {}) => {
  if (!apiKey || !model || !receiptText) return null;

  const text = String(receiptText);
  const clipped = text.length > 8000 ? text.slice(0, 8000) : text;

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

  let response;
  try {
    const endpoints = [
      `https://api-inference.huggingface.co/models/${model}`,
      `https://inference-api.huggingface.co/models/${model}`
    ];
    
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        response = await axios.post(
          endpoint,
          {
            inputs: prompt,
            parameters: {
              max_new_tokens: 256,
              return_full_text: false,
              temperature: 0.2
            }
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );
        if (response.status === 200 || response.status === 201) {
          break;
        }
      } catch (endpointError) {
        lastError = endpointError;
        if (endpointError.response && (endpointError.response.status === 410 || endpointError.response.status === 404)) {
          continue;
        }
        throw endpointError;
      }
    }
    
    if (!response) {
      throw lastError || new Error(`Hugging Face inference failed for model "${model}"`);
    }
  } catch (error) {
    const status = error?.response?.status;
    if (status) {
      throw new Error(`Hugging Face inference error ${status} for model "${model}"`);
    }
    throw new Error(`Hugging Face inference request failed for model "${model}": ${error.message}`);
  }

  let outputText = '';
  if (Array.isArray(response.data)) {
    const first = response.data[0];
    if (first && typeof first.generated_text === 'string') outputText = first.generated_text;
    else outputText = JSON.stringify(response.data);
  } else if (response.data && typeof response.data.generated_text === 'string') {
    outputText = response.data.generated_text;
  } else if (typeof response.data === 'string') {
    outputText = response.data;
  } else {
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


