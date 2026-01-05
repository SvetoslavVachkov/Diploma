const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pdfParse = require('pdf-parse');
const { createTransaction } = require('./transactionService');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { FinancialCategory } = require('../../models');

const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
};

const parseBankStatementText = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const transactions = [];
  
  const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/;
  const amountPattern = /([+-]?\s*\d+[.,]\d{2})\s*(лв|BGN|EUR|€|\$|)/i;
  const cardPattern = /(CARD|КАРТА|PAYMENT|ПЛАЩАНЕ)/i;
  
  let currentDate = null;
  let currentDescription = null;
  let currentAmount = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      if (currentDate && currentDescription && currentAmount !== null) {
        transactions.push({
          date: currentDate,
          description: currentDescription.trim(),
          amount: currentAmount
        });
      }
      currentDate = dateMatch[1];
      currentDescription = '';
      currentAmount = null;
    }
    
    const amountMatch = line.match(amountPattern);
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(/\s+/g, '').replace(',', '.');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount !== 0) {
        currentAmount = Math.abs(amount);
      }
    }
    
    if (currentDate && !dateMatch && !amountMatch) {
      const cleanLine = line.replace(amountPattern, '').replace(cardPattern, '').trim();
      if (cleanLine.length > 2 && !cleanLine.match(/^\d+$/)) {
        if (currentDescription) {
          currentDescription += ' ' + cleanLine;
        } else {
          currentDescription = cleanLine;
        }
      }
    }
  }
  
  if (currentDate && currentDescription && currentAmount !== null) {
    transactions.push({
      date: currentDate,
      description: currentDescription.trim(),
      amount: currentAmount
    });
  }
  
  return transactions;
};

const parseCSVFile = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
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
    const values = allKeys.map(k => String(row[k]).trim()).filter(v => v.length > 0);
    if (values.length > 2) {
      normalized.description = values.slice(1, -1).join(' ').trim() || values[1] || values[0];
    }
  }
  
  return normalized;
};

const extractMerchantName = (description) => {
  if (!description) return null;
  
  const text = description.trim();
  const words = text.split(/\s+/);
  
  if (words.length === 0) return null;
  
  const amountPattern = /[\d.,]+/;
  const cleanText = text.replace(amountPattern, '').trim();
  const cleanWords = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  const stopWords = ['в', 'на', 'от', 'до', 'за', 'с', 'при', 'at', 'in', 'on', 'for', 'with', 'from', 'to', 'card', 'карта', 'payment', 'плащане', 'transaction', 'транзакция'];
  const filteredWords = cleanWords.filter(word => !stopWords.includes(word.toLowerCase()));
  
  if (filteredWords.length === 0) {
    return cleanWords.slice(0, 3).join(' ').trim() || cleanWords[0] || text.substring(0, 30);
  }
  
  const merchantName = filteredWords.slice(0, 3).join(' ').trim() || filteredWords[0];
  
  return merchantName.length > 2 ? merchantName : text.substring(0, 30);
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
      } else {
        const day = match[1];
        const month = match[2];
        let year = match[3];
        if (year.length === 2) {
          year = '20' + year;
        }
        return new Date(year, month - 1, day);
      }
    }
  }
  
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return new Date();
};

const parseAmount = (amountString) => {
  if (!amountString) return 0;
  
  const amountStr = String(amountString).trim().replace(/\s+/g, '').replace(/,/g, '.');
  const match = amountStr.match(/-?\d+\.?\d*/);
  
  if (match) {
    return Math.abs(parseFloat(match[0]));
  }
  
  return 0;
};

const ensureCategoryExists = async (categoryName, type) => {
  let category = await FinancialCategory.findOne({
    where: { name: categoryName, type: type, is_active: true }
  });
  
  if (!category) {
    category = await FinancialCategory.create({
      name: categoryName,
      type: type,
      icon: null,
      color: null,
      is_active: true
    });
  }
  
  return category;
};

const importCSVTransactions = async (userId, filePath, options = {}) => {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    let rows = [];
    
    if (fileExt === '.pdf') {
      const pdfText = await extractTextFromPDF(filePath);
      const parsedTransactions = parseBankStatementText(pdfText);
      
      rows = parsedTransactions.map(tx => ({
        date: tx.date,
        amount: tx.amount.toString(),
        description: tx.description
      }));
    } else {
      rows = await parseCSVFile(filePath);
    }
    
    if (rows.length === 0) {
      return {
        success: false,
        error: 'File is empty or could not be parsed'
      };
    }
    
    const results = {
      total: rows.length,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const normalized = normalizeCSVRow(row);
      
      const amount = parseAmount(normalized.amount);
      if (amount === 0) {
        results.skipped++;
        continue;
      }
      
      let description = normalized.description || '';
      if (!description || description.trim().length < 2) {
        description = extractMerchantName(String(normalized.amount)) || 'Без описание';
      }
      
      description = extractMerchantName(description) || description || 'Без описание';
      
      if (description.length < 2) {
        description = 'Без описание';
      }
      
      const transactionDate = parseDate(normalized.date);
      
      let categorization;
      try {
        categorization = await categorizeTransaction(description, amount, {
          hfApiKey: process.env.HF_TXN_API_KEY,
          hfModel: process.env.HF_TXN_MODEL
        });
      } catch (error) {
        categorization = { success: false, error: error.message };
      }
      
      if (!categorization.success || !categorization.result) {
        const transactionType = amount < 0 ? 'expense' : (normalized.type === 'income' || normalized.type === 'credit' ? 'income' : 'expense');
        const defaultCategoryName = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
        
        let defaultCategory = await FinancialCategory.findOne({
          where: { name: defaultCategoryName, type: transactionType, is_active: true }
        });
        
        if (!defaultCategory) {
          defaultCategory = await ensureCategoryExists(defaultCategoryName, transactionType);
        }
        
        categorization = {
          success: true,
          result: {
            categoryId: defaultCategory.id,
            categoryName: defaultCategory.name,
            type: transactionType
          }
        };
      }
      
      const transactionData = {
        category_id: categorization.result.categoryId,
        amount: amount,
        description: description,
        transaction_date: transactionDate.toISOString().substring(0, 10),
        type: categorization.result.type,
        source: 'CSV Import'
      };
      
      const createResult = await createTransaction(userId, transactionData);
      
      if (createResult.success) {
        results.imported++;
      } else {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: createResult.error,
          description
        });
      }
    }
    
    return {
      success: true,
      results
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  importCSVTransactions,
  parseCSVFile,
  normalizeCSVRow,
  extractTextFromPDF,
  parseBankStatementText
};
