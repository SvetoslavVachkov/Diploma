const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { createTransaction } = require('./transactionService');
const { parseReceiptWithAI } = require('./receiptAiParseService');

const parseReceiptText = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items = [];
  const euroAmountPattern = /(?:[\d.,]+\s*(?:EUR|€))|(?:(?:€|EUR)\s*[\d.,]+)/i;
  const moneyDecimalPattern = /\b(\d{1,5}[.,]\d{2})\b/g;
  const moneyNumberPattern = /\b(\d{1,5}(?:[.,]\d{2})?)\b/g;
  const bgnAmountPattern = /(?:[\d.,]+\s*(?:BGN|лв))|(?:(?:BGN|лв)\s*[\d.,]+)/i;
  const parenAmountPattern = /\(\s*(\d{1,5}[.,]\d{2})\s*\)/g;
  const timePattern = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
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
    
    if (!merchantName && line.length > 3 && line.length < 80 && !line.match(euroAmountPattern) && !line.match(bgnAmountPattern) && !line.match(datePattern) && !line.toLowerCase().match(/общо|total|сума|date|дата|час|time|address|адрес|тел|phone|тел\.|тел:/i)) {
      const lineLower = line.toLowerCase();
      if (lineLower.match(/eltrade|datecs|tremol|fiscal|pos|terminal|receipt|касова|бележка|фискален|служебен|barcode|qr|vat|dds|еик|bulstat/i)) {
        continue;
      }
      if (lineLower.match(/ресторант|restaurant|cafe|кафе|магазин|supermarket|store|shop|merchant|заведение/i) || 
          (!line.match(/^\d+/) && !line.match(/^[\d.,\s€EUR]+$/i))) {
        merchantName = line;
      }
    }
    
    const totalKeywords = ['общо', 'total', 'сума', 'всичко', 'сума за плащане', 'amount', 'sum', 'за плащане', 'pay', 'due'];
    const hasTotalKeyword = totalKeywords.some(keyword => line.toLowerCase().includes(keyword));
    
    if (hasTotalKeyword) {
      const euroMatches = line.match(/(?:[\d.,]+)\s*(?:EUR|€)|(?:(?:€|EUR)\s*[\d.,]+)/gi);
      if (euroMatches && euroMatches.length > 0) {
        const amountStr = euroMatches[euroMatches.length - 1].replace(/[^\d.,]/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
          totalAmount = amount;
        }
      } else {
        const sanitized = line.replace(timePattern, ' ');
        const matches = [...sanitized.matchAll(moneyDecimalPattern)];
        if (matches.length > 0) {
          const last = matches[matches.length - 1][1];
          const amount = parseFloat(String(last).replace(',', '.'));
          if (!isNaN(amount) && amount > 0.01 && amount < 10000) {
            totalAmount = amount;
          }
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

  if (!totalAmount || totalAmount <= 0) {
    const candidates = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (timePattern.test(line)) continue;

      const hasBgn = /\bBGN\b|лв/i.test(line);
      const parenMatches = [...line.matchAll(parenAmountPattern)];
      const bgnMatches = [...line.matchAll(moneyDecimalPattern)];

      if (hasBgn && parenMatches.length > 0 && bgnMatches.length > 0) {
        const bgn = parseFloat(String(bgnMatches[0][1]).replace(',', '.'));
        const eur = parseFloat(String(parenMatches[parenMatches.length - 1][1]).replace(',', '.'));
        if (!isNaN(bgn) && !isNaN(eur) && bgn > 0 && eur > 0) {
          const ratio = bgn / eur;
          if (ratio > 1.7 && ratio < 2.3) {
            let score = eur + 10000;
            if (['общо', 'total', 'сума', 'sum', 'amount', 'pay', 'due'].some(k => lower.includes(k))) {
              score += 5000;
            }
            candidates.push({ v: eur, score });
          }
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      totalAmount = candidates[0].v;
    }
  }

  if (!totalAmount || totalAmount <= 0) {
    const candidates = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (timePattern.test(line)) {
        continue;
      }
      const sanitized = line.replace(timePattern, ' ');
      const hasCurrencyMarker = /€|eur|\bleva\b|лв|bgn/i.test(line);
      const matches = [...sanitized.matchAll(moneyNumberPattern)];
      if (matches.length === 0) continue;

      const hasTotalLike = ['общо', 'total', 'сума', 'sum', 'amount', 'pay', 'due'].some(k => lower.includes(k));
      for (const m of matches) {
        const v = parseFloat(String(m[1]).replace(',', '.'));
        const raw = String(m[1]);
        const hasDecimal = raw.includes('.') || raw.includes(',');
        if (!isNaN(v) && v > 0.01 && v < 10000) {
          if (!hasDecimal && !hasCurrencyMarker) {
            continue;
          }
          if (!hasCurrencyMarker && v > 2000) {
            continue;
          }
          let score = v;
          if (hasTotalLike) score += 10000;
          candidates.push({ v, score });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      totalAmount = candidates[0].v;
    }
  }
  
  const hasAnyEur = /€|\bEUR\b/i.test(text) || totalAmount > 0;

  if (!hasAnyEur) {
    return {
      date: foundDate,
      items: [],
      total: 0
    };
  }

  if (totalAmount && totalAmount > 0) {
    
    let description = merchantName;
    
    if (!description) {
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        if (lineLower.match(/domino|dominos|pizza|пиц|ресторант|restaurant|cafe|кафе|магазин|supermarket|billa|fantastico|lidl|kaufland|merchant|store|shop/i)) {
          description = line;
          break;
        }
      }
    }
    
    if (!description) {
      description = lines.find(l => {
        const len = l.length;
        const ll = l.toLowerCase();
        if (ll.match(/eltrade|datecs|tremol|fiscal|pos|terminal|receipt|касова|бележка|фискален|служебен|barcode|qr|vat|dds|еик|bulstat/i)) {
          return false;
        }
        return len > 3 && len < 100 && !l.match(euroAmountPattern) && !l.match(/^[\d.,\s€$£лвBGNUSDEUR]+$/i) && !ll.match(/общо|total|сума|date|дата|час|time|address|адрес|тел|phone/i);
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

    const run = async (psm) => {
      const worker = await Tesseract.createWorker('eng+bul', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress (psm ${psm}): ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        tessedit_ocr_engine_mode: '3',
        preserve_interword_spaces: '1'
      });
      const { data: { text } } = await worker.recognize(imagePath);
      await worker.terminate();
      return text || '';
    };

    const textPsm6 = await run(6);
    const textPsm11 = await run(11);
    const pickBetter = (a, b) => {
      const score = (t) => {
        const digits = (t.match(/\d/g) || []).length;
        const moneyLike = (t.match(/\d+[.,]\d{2}/g) || []).length;
        return digits + moneyLike * 5;
      };
      return score(b) > score(a) ? b : a;
    };

    const text = pickBetter(textPsm6, textPsm11);
    
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

    const aiKey = process.env.HF_RECEIPT_API_KEY || process.env.HF_STMT_API_KEY || process.env.HF_TXN_API_KEY;
    const aiModel = process.env.HF_RECEIPT_MODEL || process.env.HF_STMT_MODEL;
    if (aiKey && aiModel) {
      try {
        const aiParsed = await parseReceiptWithAI(text, { apiKey: aiKey, model: aiModel });
        if (aiParsed?.amount_eur && aiParsed.amount_eur > 0) {
          const aiMerchant = aiParsed.merchant || null;
          const desc = aiMerchant && aiMerchant.length > 2 ? aiMerchant : 'Бележка';
          const parsed = {
            date: null,
            items: [{ description: desc.substring(0, 100), amount: aiParsed.amount_eur }],
            total: aiParsed.amount_eur
          };
          return await (async () => {
            const results = [];
            let imported = 0;
            let failed = 0;

            for (const item of parsed.items) {
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

              const transactionDate = new Date();
              const formatDateLocal = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
              };

              const transactionData = {
                category_id: categoryId,
                amount: -Math.abs(item.amount),
                description: item.description,
                transaction_date: formatDateLocal(transactionDate),
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

            return {
              success: true,
              imported,
              total: parsed.items.length,
              results
            };
          })();
        }
      } catch (aiErr) {
      }
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
          transactionType: 'expense',
          userId
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

      const formatDateLocal = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      
      const transactionData = {
        category_id: categoryId,
        amount: -Math.abs(item.amount),
        description: item.description,
        transaction_date: formatDateLocal(transactionDate),
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
