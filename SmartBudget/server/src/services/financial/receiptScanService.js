const fs = require('fs');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { createTransaction } = require('./transactionService');

const parseReceiptText = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items = [];
  const amountPattern = /[\d.,]+\s*(лв|BGN|EUR|€|\$)/i;
  const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/;
  
  let foundDate = null;
  let totalAmount = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const dateMatch = line.match(datePattern);
    if (dateMatch && !foundDate) {
      foundDate = dateMatch[1];
    }
    
    if (line.toLowerCase().includes('общо') || line.toLowerCase().includes('total') || line.toLowerCase().includes('сума')) {
      const amountMatch = line.match(amountPattern);
      if (amountMatch) {
        totalAmount = parseFloat(amountMatch[0].replace(/[^\d.,]/g, '').replace(',', '.'));
      }
    }
    
    const merchantMatch = line.match(/^([А-Яа-яA-Za-z\s]+?)\s+([\d.,]+\s*(?:лв|BGN|EUR|€|\$))/i);
    if (merchantMatch) {
      const merchant = merchantMatch[1].trim();
      const amount = parseFloat(merchantMatch[2].replace(/[^\d.,]/g, '').replace(',', '.'));
      if (merchant.length > 2 && amount > 0) {
        items.push({ description: merchant, amount });
      }
    }
  }
  
  if (items.length === 0 && totalAmount) {
    const firstLine = lines.find(l => l.length > 5 && !l.match(amountPattern));
    if (firstLine) {
      items.push({ description: firstLine.substring(0, 50), amount: totalAmount });
    }
  }
  
  return {
    date: foundDate,
    items: items.length > 0 ? items : [{ description: lines[0] || 'Бележка', amount: totalAmount || 0 }],
    total: totalAmount
  };
};

const scanReceipt = async (userId, receiptText, receiptFile) => {
  try {
    let text = receiptText || '';
    
    if (receiptFile) {
      const fileContent = fs.readFileSync(receiptFile.path, 'utf8');
      text = fileContent;
      fs.unlinkSync(receiptFile.path);
    }
    
    if (!text || text.trim().length < 5) {
      return {
        success: false,
        error: 'Receipt text is too short or empty'
      };
    }
    
    const parsed = parseReceiptText(text);
    
    if (parsed.items.length === 0) {
      return {
        success: false,
        error: 'Could not extract items from receipt'
      };
    }
    
    const results = [];
    let imported = 0;
    let failed = 0;
    
    for (const item of parsed.items) {
      if (!item.description || item.amount <= 0) {
        failed++;
        results.push({
          description: item.description || 'Unknown',
          amount: item.amount || 0,
          category: null,
          status: 'failed',
          error: 'Invalid item data'
        });
        continue;
      }
      
      const categorization = await categorizeTransaction(item.description, item.amount, {
        hfApiKey: process.env.HF_TXN_API_KEY,
        hfModel: process.env.HF_TXN_MODEL
      });
      
      if (!categorization.success || !categorization.result) {
        failed++;
        results.push({
          description: item.description,
          amount: item.amount,
          category: null,
          status: 'failed',
          error: categorization.error || 'Categorization failed'
        });
        continue;
      }
      
      const transactionDate = parsed.date 
        ? new Date(parsed.date.split(/[.\/]/).reverse().join('-'))
        : new Date();
      
      const transactionData = {
        category_id: categorization.result.categoryId,
        amount: item.amount,
        description: item.description,
        transaction_date: transactionDate.toISOString().substring(0, 10),
        type: categorization.result.type,
        source: 'Receipt Scan'
      };
      
      const createResult = await createTransaction(userId, transactionData);
      
      if (createResult.success) {
        imported++;
        results.push({
          description: item.description,
          amount: item.amount,
          category: categorization.result.categoryName,
          status: 'imported'
        });
      } else {
        failed++;
        results.push({
          description: item.description,
          amount: item.amount,
          category: categorization.result.categoryName,
          status: 'failed',
          error: createResult.error
        });
      }
    }
    
    return {
      success: true,
      imported,
      total: parsed.items.length,
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
  scanReceipt,
  parseReceiptText
};
