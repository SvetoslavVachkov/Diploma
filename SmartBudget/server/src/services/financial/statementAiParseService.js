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

const parseStatementWithAI = async (statementText, { apiKey, model } = {}) => {
  if (!apiKey || !model || !statementText) {
    return [];
  }

  const text = String(statementText);
  const clipped = text.length > 12000 ? text.slice(0, 12000) : text;

  const prompt = `You are an expert bank statement parser.
Extract all transactions from the statement text below and return ONLY valid JSON (no markdown).

Return a JSON array of objects with EXACT keys:
- date: string in YYYY-MM-DD (preferred) OR DD.MM.YYYY if not possible
- description: string (merchant / reason), keep it short but meaningful
- amount: number (POSITIVE, no sign)
- type: "income" or "expense"

Rules:
- "Дт" means expense, "Кт" means income.
- Ignore balances and running totals; pick the transaction amount, not the balance after operation.
- If both BGN and EUR are present (e.g. "X BGN (Y EUR)" or "X EUR (Y BGN)"), use the EUR amount.

STATEMENT TEXT:
${clipped}`;

  let response;
  try {
    response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 1200,
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
    if (first && typeof first.generated_text === 'string') {
      outputText = first.generated_text;
    } else {
      outputText = JSON.stringify(response.data);
    }
  } else if (response.data && typeof response.data.generated_text === 'string') {
    outputText = response.data.generated_text;
  } else if (typeof response.data === 'string') {
    outputText = response.data;
  } else {
    outputText = JSON.stringify(response.data || '');
  }

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


