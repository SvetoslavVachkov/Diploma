const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pdfParse = require('pdf-parse');
const { createTransaction } = require('./transactionService');
const { categorizeTransaction } = require('./transactionCategorizationService');

const parsePDFFile = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const results = [];
    
    for (const line of lines) {
      const parts = line.split(/\s+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
        const row = {};
        const dateMatch = line.match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/);
        const amountMatch = line.match(/([\d.,]+)/g);
        
        if (dateMatch) {
          row.date = dateMatch[1];
        }
        
        if (amountMatch && amountMatch.length > 0) {
          const amounts = amountMatch.map(a => parseFloat(a.replace(',', '.')));
          row.amount = Math.max(...amounts).toString();
        }
        
        const descParts = parts.filter(p => !p.match(/^\d+[.,]\d+$/) && !p.match(/^\d{1,2}[.\/]\d{1,2}/));
        if (descParts.length > 0) {
          row.description = descParts.join(' ');
        }
        
        if (row.amount || row.description) {
          results.push(row);
        }
      }
    }
    
    return results;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
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
  
  const dateFields = ['date', 'transaction_date', 'дата', 'transaction date'];
  const amountFields = ['amount', 'сума', 'price', 'цена', 'value', 'стойност'];
  const descriptionFields = ['description', 'описание', 'details', 'детайли', 'merchant', 'merchant name', 'name', 'име', 'details', 'transaction', 'транзакция'];
  const typeFields = ['type', 'тип', 'transaction_type'];
  
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
  
  if (!normalized.date && Object.keys(row).length > 0) {
    normalized.date = row[Object.keys(row)[0]];
  }
  
  if (!normalized.amount && Object.keys(row).length > 1) {
    normalized.amount = row[Object.keys(row)[1]];
  }
  
  if (!normalized.description && Object.keys(row).length > 2) {
    normalized.description = row[Object.keys(row)[2]];
  }
  
  return normalized;
};

const parseDate = (dateString) => {
  if (!dateString) return new Date();
  
  const dateStr = String(dateString).trim();
  
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return new Date(match[1], match[2] - 1, match[3]);
      } else {
        const day = match[1];
        const month = match[2];
        const year = match[3];
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
  
  const amountStr = String(amountString).trim().replace(/,/g, '.');
  const match = amountStr.match(/-?\d+\.?\d*/);
  
  if (match) {
    return Math.abs(parseFloat(match[0]));
  }
  
  return 0;
};

const importCSVTransactions = async (userId, filePath, options = {}) => {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    let rows = [];
    
    if (fileExt === '.pdf') {
      rows = await parsePDFFile(filePath);
    } else {
      rows = await parseCSVFile(filePath);
    }
    
    if (rows.length === 0) {
      return {
        success: false,
        error: 'CSV file is empty'
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
      
      if (!normalized.description && !normalized.amount) {
        results.skipped++;
        continue;
      }
      
      const amount = parseAmount(normalized.amount);
      if (amount === 0) {
        results.skipped++;
        continue;
      }
      
      const description = normalized.description || 'Без описание';
      const transactionDate = parseDate(normalized.date);
      
      const categorization = await categorizeTransaction(description, amount, {
        hfApiKey: process.env.HF_TXN_API_KEY,
        hfModel: process.env.HF_TXN_MODEL
      });
      
      if (!categorization.success) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: categorization.error,
          description
        });
        continue;
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
  normalizeCSVRow
};

