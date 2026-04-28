const axios = require('axios');

const extractJsonArray = (text) => {
  if (!text) return null;

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch (e) {
    }
  }

  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch (e) {
  }

  return null;
};

const normalizeType = (type) => {
  const t = String(type || '').toLowerCase().trim();
  if (t === 'income' || t === 'in') return 'income';
  if (t === 'expense' || t === 'out') return 'expense';
  return null;
};

const isValidDateString = (date) => {
  const s = String(date || '').trim();
  if (!s) return false;
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return true;
  if (s.match(/^\d{2}\.\d{2}\.\d{4}$/)) return true;
  return false;
};

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function chatCompletion(prompt, {
  openaiApiKey,
  openaiModel,
  hfApiKey,
  hfModel,
  groqApiKey,
  groqModel
}, maxTokens = 2000) {
  const headers = { 'Content-Type': 'application/json' };
  const timeout = 60000;

  // Primary provider: OpenAI / ChatGPT models
  if (openaiApiKey) {
    try {
      const response = await axios.post(OPENAI_CHAT_URL, {
        model: openaiModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1
      }, {
        headers: { ...headers, 'Authorization': `Bearer ${openaiApiKey}` },
        timeout
      });
      const msg = response.data?.choices?.[0]?.message;
      if (msg?.content) return msg.content;
    } catch (err) {
      // Continue to fallback providers below.
    }
  }

  // Fallback 1: HuggingFace router
  if (hfApiKey && hfModel) {
    try {
      const response = await axios.post(HF_ROUTER_URL, {
        model: hfModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1
      }, {
        headers: { ...headers, 'Authorization': `Bearer ${hfApiKey}` },
        timeout
      });
      const msg = response.data?.choices?.[0]?.message;
      if (msg?.content) return msg.content;
    } catch (err) {
      // Continue to final fallback.
    }
  }

  // Fallback 2: Groq
  if (groqApiKey && groqModel) {
    const response = await axios.post(GROQ_CHAT_URL, {
      model: groqModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1
    }, {
      headers: { ...headers, 'Authorization': `Bearer ${groqApiKey}` },
      timeout
    });
    const msg = response.data?.choices?.[0]?.message;
    if (msg?.content) return msg.content;
  }

  return '';
}

const parseStatementWithAI = async (statementText, { apiKey, model, groqApiKey, groqModel } = {}) => {
  if (!statementText) return [];
  const openaiApiKey = process.env.OPENAI_API_KEY || null;
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const hfApiKey = apiKey || process.env.HF_STMT_API_KEY || process.env.HF_TXN_API_KEY || null;
  const hfModel = model || process.env.HF_STMT_MODEL || null;
  if (!openaiApiKey && !hfApiKey && !groqApiKey) return [];
  if (groqApiKey && !groqModel) return [];

  const text = String(statementText);
  const clipped = text.length > 20000 ? text.slice(0, 20000) : text;

  const prompt = `You are an expert bank statement parser. Extract ALL transactions from the statement text below. Be thorough and extract every single transaction you can find.

Return ONLY valid JSON array (no markdown, no explanations, just the JSON array).

Each transaction must have EXACT keys:
- date: string in YYYY-MM-DD format (preferred) OR DD.MM.YYYY if not possible
- description: string (merchant name or transaction reason), keep it short but meaningful (max 200 chars)
- amount: number (POSITIVE value, no sign, no negative numbers)
- type: "income" or "expense"

CRITICAL RULES:
1. Extract EVERY transaction you see, even if they look similar or have small amounts
2. "Дт" (Debit) means expense, "Кт" (Credit) means income
3. "Money in", "Transfer from", "Deposit", "Refund", "Exchanged to", "Apple Pay deposit" = income
4. "Money out", "Transfer to", "Withdrawal", "Payment", "Cash withdrawal" = expense
5. Ignore balances, running totals, and summary lines - only extract actual transactions
6. If both BGN and EUR are present (e.g. "X BGN (Y EUR)" or "X EUR (Y BGN)"), always use the EUR amount
7. Look for transactions across multiple pages and sections
8. If a transaction spans multiple lines, combine them into one transaction
9. Extract transactions even if the format is slightly different or unusual
10. Do not skip any transactions - be exhaustive

STATEMENT TEXT:
${clipped}`;

  let outputText = '';
  try {
    outputText = await chatCompletion(prompt, {
      openaiApiKey,
      openaiModel,
      hfApiKey,
      hfModel,
      groqApiKey,
      groqModel
    }, 2000);
  } catch (error) {
    const status = error?.response?.status;
    if (status) {
      throw new Error(`AI inference error ${status}: ${error.response?.data?.error?.message || error.message}`);
    }
    throw new Error(`AI inference request failed: ${error.message}`);
  }

  if (!outputText) return [];

  const parsed = extractJsonArray(outputText);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const cleaned = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;

    const date = String(item.date || '').trim();
    const description = String(item.description || '').trim();
    const type = normalizeType(item.type);
    const amount = Number(item.amount);

    if (!isValidDateString(date)) continue;
    if (!description || description.length < 2) continue;
    if (!type) continue;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) continue;

    cleaned.push({
      date,
      description: description.substring(0, 200),
      amount,
      type
    });
  }

  return cleaned;
};

module.exports = {
  parseStatementWithAI
};


