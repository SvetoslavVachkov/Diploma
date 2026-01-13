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

  let response;
  try {
    const endpoints = [
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          return_full_text: false,
          temperature: 0.1
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


