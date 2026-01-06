const isValidText = (text) => {
  if (!text || text.length === 0) return false;

  const allowedChars = /[\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u0100-\u017F\u0180-\u024F\s]/;
  let validCharCount = 0;

  for (let i = 0; i < text.length; i++) {
    if (allowedChars.test(text[i])) {
      validCharCount++;
    }
  }

  const validRatio = validCharCount / text.length;
  if (validRatio < 0.8) return false;

  const suspiciousPatterns = [
    /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]{2,}/,
    /[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u0400-\u04FF\s]{4,}/
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
};

const cleanDescription = (text) => {
  if (!text) return '';

  let cleaned = String(text)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u200B/g, '')
    .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u0100-\u017F\u0180-\u024F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!isValidText(cleaned)) return '';

  try {
    const buffer = Buffer.from(cleaned, 'utf8');
    cleaned = buffer.toString('utf8');
    if (!isValidText(cleaned)) return '';
  } catch (e) {
    return '';
  }

  return cleaned.substring(0, 255);
};

const extractMerchantName = (description) => {
  if (!description) return null;

  const text = cleanDescription(description);
  if (!text || !isValidText(text)) return null;

  const words = text.split(/\s+/);
  if (words.length === 0) return null;

  const amountPattern = /[\d.,]+/;
  const cleanText = text.replace(amountPattern, '').trim();
  const cleanWords = cleanText.split(/\s+/).filter((w) => w.length > 0 && isValidText(w));

  const stopWords = [
    'в', 'на', 'от', 'до', 'за', 'с', 'при',
    'at', 'in', 'on', 'for', 'with', 'from', 'to',
    'card', 'карта', 'payment', 'плащане', 'transaction', 'транзакция'
  ];
  const filteredWords = cleanWords.filter((word) => !stopWords.includes(word.toLowerCase()));

  let result = null;
  if (filteredWords.length === 0) {
    result = cleanWords.slice(0, 3).join(' ').trim() || cleanWords[0] || text.substring(0, 30);
  } else {
    result = filteredWords.slice(0, 3).join(' ').trim() || filteredWords[0];
  }

  if (!result || result.length < 2) {
    result = text.substring(0, 30);
  }

  result = cleanDescription(result);
  if (!result || !isValidText(result) || result.length < 2) return null;

  return result;
};

const parseDate = (dateString) => {
  if (!dateString) return new Date();

  const dateStr = String(dateString).trim();

  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return new Date(match[1], match[2] - 1, match[3]);
      }
      const day = match[1];
      const month = match[2];
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date();
};

const parseAmount = (amountString) => {
  if (!amountString) return 0;

  const amountStr = String(amountString).trim().replace(/\s+/g, '').replace(/,/g, '.');
  const match = amountStr.match(/-?\d+\.?\d*/);

  if (match) return parseFloat(match[0]);
  return 0;
};

const normalizeCSVRow = (row) => {
  const normalized = {};

  const dateFields = ['date', 'transaction_date', 'дата', 'transaction date', 'дата на транзакция', 'transactiondate'];
  const amountFields = ['amount', 'сума', 'price', 'цена', 'value', 'стойност', 'сума лв', 'amount bgn', 'сума bgn'];
  const descriptionFields = ['description', 'описание', 'details', 'детайли', 'merchant', 'merchant name', 'name', 'име', 'transaction', 'транзакция', 'details of transaction', 'описание на транзакция', 'beneficiary', 'получател', 'payer', 'платец'];
  const typeFields = ['type', 'тип', 'transaction_type', 'debit', 'credit'];

  for (const field of dateFields) {
    if (row[field]) {
      normalized.date = row[field];
      break;
    }
  }

  for (const field of amountFields) {
    if (row[field]) {
      normalized.amount = row[field];
      break;
    }
  }

  for (const field of descriptionFields) {
    if (row[field]) {
      normalized.description = row[field];
      break;
    }
  }

  for (const field of typeFields) {
    if (row[field]) {
      normalized.type = row[field];
      break;
    }
  }

  const allKeys = Object.keys(row);

  if (!normalized.date && allKeys.length > 0) {
    for (const key of allKeys) {
      const value = String(row[key]).trim();
      if (value.match(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/)) {
        normalized.date = value;
        break;
      }
    }
  }

  if (!normalized.amount && allKeys.length > 0) {
    for (const key of allKeys) {
      const value = String(row[key]).trim();
      if (value.match(/[+-]?\s*\d+[.,]\d{2}/)) {
        normalized.amount = value;
        break;
      }
    }
  }

  if (!normalized.description && allKeys.length > 0) {
    for (const key of allKeys) {
      const value = String(row[key]).trim();
      if (value.length > 3 && !value.match(/^\d+[.,]\d{2}$/) && !value.match(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/)) {
        normalized.description = value;
        break;
      }
    }
  }

  if (!normalized.description && allKeys.length > 2) {
    const values = allKeys.map((k) => String(row[k]).trim()).filter((v) => v.length > 0);
    if (values.length > 2) {
      normalized.description = values.slice(1, -1).join(' ').trim() || values[1] || values[0];
    }
  }

  return normalized;
};

module.exports = {
  isValidText,
  cleanDescription,
  extractMerchantName,
  parseDate,
  parseAmount,
  normalizeCSVRow
};


