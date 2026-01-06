const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { createTransaction } = require('./transactionService');

const parseReceiptText = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items = [];
  const euroAmountPattern = /(?:[\d.,]+\s*(?:EUR|€))|(?:(?:€|EUR)\s*[\d.,]+)/i;
  const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/;
  
  let foundDate = null;
  let totalAmount = null;
  let merchantName = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const dateMatch = line.match(datePattern);
    if (dateMatch && !foundDate) {
      foundDate = dateMatch[1];
    }
    
    if (!merchantName && line.length > 3 && line.length < 80 && !line.match(euroAmountPattern) && !line.match(datePattern) && !line.toLowerCase().match(/общо|total|сума|date|дата|час|time|address|адрес|тел|phone|тел\.|тел:/i)) {
      const lineLower = line.toLowerCase();
      if (lineLower.match(/ресторант|restaurant|cafe|кафе|магазин|supermarket|store|shop|merchant|заведение/i) || 
          (!line.match(/^\d+/) && !line.match(/^[\d.,\s€EUR]+$/i))) {
        merchantName = line;
      }
    }
    
    const totalKeywords = ['общо', 'total', 'сума', 'всичко', 'сума за плащане', 'amount', 'sum'];
    const hasTotalKeyword = totalKeywords.some(keyword => line.toLowerCase().includes(keyword));
    
    if (hasTotalKeyword) {
      const euroMatches = line.match(/(?:[\d.,]+)\s*(?:EUR|€)|(?:(?:€|EUR)\s*[\d.,]+)/gi);
      if (euroMatches && euroMatches.length > 0) {
        const amountStr = euroMatches[euroMatches.length - 1].replace(/[^\d.,]/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
          totalAmount = amount;
        }
      }
    }
    
    const euroMatches = line.match(/(?:[\d.,]+)\s*(?:EUR|€)|(?:(?:€|EUR)\s*[\d.,]+)/gi);
    if (euroMatches && !hasTotalKeyword) {
      for (const amountMatch of euroMatches) {
        const amountStr = amountMatch.replace(/[^\d.,]/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0 && amount < 10000) {
          if (!totalAmount || amount > totalAmount) {
            totalAmount = amount;
          }
        }
      }
    }
  }
  
  if (!totalAmount || totalAmount <= 0) {
    const euroPattern = /(?:€|EUR)\s*(\d{1,2}[.,]\d{2,4})/gi;
    const euroMatches = text.match(euroPattern);
    if (euroMatches) {
      const validAmounts = [];
      for (const match of euroMatches) {
        const numStr = match.replace(/[^\d.,]/g, '').replace(',', '.');
        const num = parseFloat(numStr);
        if (!isNaN(num) && num > 0.1 && num < 10000) {
          validAmounts.push(num);
        }
      }
      if (validAmounts.length > 0) {
        validAmounts.sort((a, b) => b - a);
        totalAmount = validAmounts[0];
      }
    }
  }
  
  if (totalAmount && totalAmount > 0) {
    
    let description = merchantName;
    
    if (!description) {
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        if (lineLower.match(/domino|pizza|ресторант|restaurant|cafe|кафе|магазин|supermarket|billa|fantastico|lidl|kaufland|merchant|store|shop/i)) {
          description = line;
          break;
        }
      }
    }
    
    if (!description) {
      description = lines.find(l => {
        const len = l.length;
        return len > 3 && len < 100 && !l.match(amountPattern) && !l.match(/^[\d.,\s€$£лвBGNUSDEUR]+$/i) && !l.toLowerCase().match(/общо|total|сума|date|дата|час|time|address|адрес|тел|phone/i);
      }) || 'Бележка';
    }
    
    items.push({ description: description.substring(0, 100), amount: totalAmount });
  }
  
  if (items.length === 0 && totalAmount && totalAmount > 0) {
    items.push({ description: merchantName || 'Бележка', amount: totalAmount });
  }
  
  return {
    date: foundDate,
    items: items.length > 0 ? items : [{ description: merchantName || lines.find(l => l.length > 2) || 'Бележка', amount: totalAmount || 0 }],
    total: totalAmount
  };
};

const extractTextFromImage = async (imagePath) => {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error('Image file does not exist');
    }
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+bul', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: '6',
      tessedit_ocr_engine_mode: '1'
    });
    
    if (!text || text.trim().length < 3) {
      throw new Error('OCR extracted no text from image');
    }
    
    return text;
  } catch (error) {
    if (error.message && (error.message.includes('OCR') || error.message.includes('extracted'))) {
      throw error;
    }
    throw new Error(`OCR failed: ${error.message}`);
  }
};

const scanReceipt = async (userId, receiptText, receiptFile) => {
  let fileToDelete = null;
  
  try {
    let text = receiptText || '';
    
    if (receiptFile) {
      fileToDelete = receiptFile.path;
      const fileExt = path.extname(receiptFile.originalname || receiptFile.path).toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      
      if (imageExtensions.includes(fileExt)) {
        try {
          if (!fs.existsSync(receiptFile.path)) {
            return {
              success: false,
              error: 'Файлът не съществува'
            };
          }
          
          console.log('Starting OCR for file:', receiptFile.path);
          text = await extractTextFromImage(receiptFile.path);
          console.log('OCR completed, extracted text length:', text.length);
        } catch (ocrError) {
          console.error('OCR error:', ocrError);
          return {
            success: false,
            error: `OCR грешка: ${ocrError.message}`
          };
        }
      } else {
        try {
          if (!fs.existsSync(receiptFile.path)) {
            return {
              success: false,
              error: 'Файлът не съществува'
            };
          }
          const fileContent = fs.readFileSync(receiptFile.path, 'utf8');
          text = fileContent;
        } catch (readError) {
          console.error('File read error:', readError);
          return {
            success: false,
            error: `Грешка при четене на файл: ${readError.message}`
          };
        }
      }
    }
    
    if (!text || text.trim().length < 3) {
      return {
        success: false,
        error: 'Текстът от бележката е твърде кратък или празен. Моля проверете снимката.'
      };
    }
    
    const parsed = parseReceiptText(text);
    
    if (parsed.items.length === 0 || (parsed.items.length === 1 && parsed.items[0].amount === 0)) {
      const debugInfo = text.length > 200 ? text.substring(0, 200) + '...' : text;
      return {
        success: false,
        error: `Не можах да извлека сума от бележката. Извлечен текст: ${debugInfo}`
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
      
      let categoryId = null;
      let categoryName = null;
      
      try {
        const categorization = await categorizeTransaction(item.description, item.amount, {
          hfApiKey: process.env.HF_TXN_API_KEY,
          hfModel: process.env.HF_TXN_MODEL,
          transactionType: 'expense'
        });
        
        if (categorization.success && categorization.result && categorization.result.categoryId) {
          const { FinancialCategory } = require('../../models');
          const foundCategory = await FinancialCategory.findByPk(categorization.result.categoryId);
          if (foundCategory && foundCategory.type === 'expense') {
            categoryId = categorization.result.categoryId;
            categoryName = categorization.result.categoryName;
          }
        }
      } catch (catError) {
        console.error('Categorization error:', catError);
      }
      
      if (!categoryId) {
        const { FinancialCategory } = require('../../models');
        const defaultCategory = await FinancialCategory.findOne({
          where: { name: 'Други разходи', type: 'expense', is_active: true }
        });
        if (defaultCategory) {
          categoryId = defaultCategory.id;
          categoryName = defaultCategory.name;
        } else {
          const newCategory = await FinancialCategory.create({
            name: 'Други разходи',
            type: 'expense',
            icon: null,
            color: null,
            is_active: true
          });
          categoryId = newCategory.id;
          categoryName = newCategory.name;
        }
      }
      
      const transactionDate = parsed.date 
        ? new Date(parsed.date.split(/[.\/]/).reverse().join('-'))
        : new Date();
      
      const transactionData = {
        category_id: categoryId,
        amount: -Math.abs(item.amount),
        description: item.description,
        transaction_date: transactionDate.toISOString().substring(0, 10),
        type: 'expense',
        source: 'Receipt Scan'
      };
      
      const createResult = await createTransaction(userId, transactionData);
      
      if (createResult.success) {
        imported++;
        results.push({
          description: item.description,
          amount: item.amount,
          category: categoryName,
          status: 'imported'
        });
      } else {
        failed++;
        results.push({
          description: item.description,
          amount: item.amount,
          category: categoryName,
          status: 'failed',
          error: createResult.error
        });
      }
    }
    
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      try {
        fs.unlinkSync(fileToDelete);
      } catch (unlinkError) {
      }
    }
    
    return {
      success: true,
      imported,
      total: parsed.items.length,
      results
    };
    
  } catch (error) {
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      try {
        fs.unlinkSync(fileToDelete);
      } catch (unlinkError) {
      }
    }
    console.error('Receipt scan service error:', error);
    return {
      success: false,
      error: error.message || 'Неизвестна грешка при сканиране на бележка'
    };
  }
};

module.exports = {
  scanReceipt,
  parseReceiptText
};
