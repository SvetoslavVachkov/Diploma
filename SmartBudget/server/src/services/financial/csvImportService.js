const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createTransaction } = require('./transactionService');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { parseStatementWithAI } = require('./statementAiParseService');
const { extractTextFromPDF } = require('./pdfTextExtractor');
const {
  isValidText,
  cleanDescription,
  extractMerchantName,
  parseDate,
  parseAmount,
  normalizeCSVRow
} = require('./csvImportUtils');
const { FinancialCategory, FinancialTransaction } = require('../../models');
const { Op } = require('sequelize');

const ensureCategoryExists = async (categoryName, categoryType) => {
  let category = await FinancialCategory.findOne({
    where: { name: categoryName, type: categoryType, is_active: true }
  });
  
  if (!category) {
    category = await FinancialCategory.create({
      name: categoryName,
      type: categoryType,
      is_active: true
    });
  }
  
  return category;
};

const ensureCategoryIdMatchesType = async (categoryId, desiredType) => {
  if (!categoryId) return null;

  const cat = await FinancialCategory.findByPk(categoryId);
  if (!cat) return null;

  if (cat.type === desiredType) return cat.id;

  let match = await FinancialCategory.findOne({
    where: { name: cat.name, type: desiredType, is_active: true }
  });

  if (!match) {
    match = await FinancialCategory.create({
      name: cat.name,
      type: desiredType,
      icon: cat.icon ?? null,
      color: cat.color ?? null,
      is_active: true
    });
  }

  return match.id;
};


const parseRevolutDate = (dateStr) => {
  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  
  const match = dateStr.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})/i);
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    const year = match[3];
    return `${day}.${month}.${year}`;
  }
  
  return dateStr;
};

const parseTBIBankStatement = (text) => {
  const transactions = [];
  const seenTransactions = new Set();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const datePattern = /(\d{2}\.\d{2}\.\d{4})/;
  const bgnEurPattern = /(\d+[.,]\d+)\s*BGN\s*\(([\d.,]+)\s*EUR\)/i;
  const eurBgnPattern = /(\d+[.,]\d+)\s*EUR\s*\(([\d.,]+)\s*BGN\)/i;
  
  const extractExchangeRate = (text) => {
    const matches = text.match(/(\d+[.,]\d+)\s*BGN\s*\(([\d.,]+)\s*EUR\)/g);
    if (matches && matches.length > 0) {
      const match = matches[0].match(/(\d+[.,]\d+)\s*BGN\s*\(([\d.,]+)\s*EUR\)/);
      if (match) {
        const bgn = parseFloat(match[1].replace(',', '.'));
        const eur = parseFloat(match[2].replace(',', '.'));
        if (bgn > 0 && eur > 0) {
          return bgn / eur;
        }
      }
    }
    return null;
  };
  
  const defaultRate = 1.95583;
  let exchangeRate = extractExchangeRate(text) || defaultRate;
  
  const convertBGNToEUR = (bgnAmount) => {
    return bgnAmount / exchangeRate;
  };
  
  let inTransactionTable = false;
  let foundHeader = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/Дата осч\.|Вальор|Номер.*Основание|Дт\/Кт|Дт\s+Кт/i)) {
      inTransactionTable = true;
      foundHeader = true;
      continue;
    }
    
    if (line.match(/Телефон|Електронна поща|www\.|Стр\.\s+\d+\s+от|Салдо в началото|Салдо в края|Период от|Титуляр|Сметка|Валута|tbi bank/i)) {
      if (inTransactionTable && transactions.length > 0) {
        break;
      }
      if (foundHeader && !inTransactionTable) {
        inTransactionTable = true;
      }
      continue;
    }
    
    if (!inTransactionTable && foundHeader) {
      inTransactionTable = true;
    }
    
    if (!inTransactionTable) {
      if (line.match(datePattern) && (line.includes('Дт') || line.includes('Кт'))) {
        inTransactionTable = true;
        foundHeader = true;
      } else {
        continue;
      }
    }
    
    if (!line.match(datePattern)) continue;
    
    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;
    
    const hasDt = line.includes('Дт');
    const hasKt = line.includes('Кт');
    
    if (!hasDt && !hasKt) continue;
    
    const dateStr = dateMatch[1];
    let isIncome = hasKt;
    
    let description = '';
    let amount = null;
    
    const dtKtIndex = line.indexOf('Дт') >= 0 ? line.indexOf('Дт') : line.indexOf('Кт');
    if (dtKtIndex >= 0) {
      const afterDtKt = line.substring(dtKtIndex + 2).trim();
      
      const bgnEurMatch = afterDtKt.match(bgnEurPattern);
      const eurBgnMatch = afterDtKt.match(eurBgnPattern);
      
      if (eurBgnMatch) {
        const eurAmount = parseFloat(eurBgnMatch[1].replace(',', '.'));
        amount = eurAmount;
      } else if (bgnEurMatch) {
        const eurAmount = parseFloat(bgnEurMatch[2].replace(',', '.'));
        amount = eurAmount;
      } else {
        const firstEurMatch = afterDtKt.match(/(\d+[.,]\d+)\s*EUR/i);
        const firstBgnMatch = afterDtKt.match(/(\d+[.,]\d+)\s*BGN/i);
        
        if (firstEurMatch) {
          const firstEurIndex = firstEurMatch.index;
          const secondEurMatch = afterDtKt.substring(firstEurIndex + firstEurMatch[0].length).match(/(\d+[.,]\d+)\s*EUR/i);
          
          if (secondEurMatch) {
            amount = parseFloat(firstEurMatch[1].replace(',', '.'));
          } else {
            amount = parseFloat(firstEurMatch[1].replace(',', '.'));
          }
        } else if (firstBgnMatch) {
          const firstBgnIndex = firstBgnMatch.index;
          const secondBgnMatch = afterDtKt.substring(firstBgnIndex + firstBgnMatch[0].length).match(/(\d+[.,]\d+)\s*BGN/i);
          
          if (secondBgnMatch) {
            const bgnAmount = parseFloat(firstBgnMatch[1].replace(',', '.'));
            amount = convertBGNToEUR(bgnAmount);
          } else {
            const bgnAmount = parseFloat(firstBgnMatch[1].replace(',', '.'));
            amount = convertBGNToEUR(bgnAmount);
          }
        } else {
          const amountMatch = afterDtKt.match(/^(\d+[.,]\d+)/);
          if (amountMatch) {
            const amtStr = amountMatch[1].replace(',', '.');
            const amt = parseFloat(amtStr);
            const contextAfter = afterDtKt.substring(amountMatch.index + amountMatch[0].length);
            const tail = (contextAfter || '').trimStart();
            if (tail.match(/^BGN\b/i)) {
              amount = convertBGNToEUR(amt);
            } else if (tail.match(/^EUR\b/i) || tail.startsWith('€')) {
              amount = amt;
            } else if (tail.match(/^\(\s*[\d.,]+\s*EUR\b/i)) {
              amount = convertBGNToEUR(amt);
            } else if (tail.match(/^\(\s*[\d.,]+\s*BGN\b/i)) {
              amount = amt;
            } else {
              amount = amt;
            }
          }
        }
      }
    } else {
      const amountMatch = line.match(/Дт\s+([\d.,]+)\s*(?:BGN|EUR)|Кт\s+([\d.,]+)\s*(?:BGN|EUR)/i);
      if (amountMatch) {
        const amtStr = (amountMatch[1] || amountMatch[2]).replace(',', '.');
        const amt = parseFloat(amtStr);
        if (line.match(/BGN/i)) {
          amount = convertBGNToEUR(amt);
        } else {
          amount = amt;
        }
      }
    }
    
    if (!amount || amount <= 0) continue;
    
    if (dtKtIndex > 0) {
      const beforeDtKt = line.substring(0, dtKtIndex).trim();
      const parts = beforeDtKt.split(/\s+/).filter(p => p.trim().length > 0);
      
      let descParts = [];
      let dateCount = 0;
      
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        
        if (part.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          dateCount++;
          continue;
        }
        
        if (part.match(/^\d+$/) && dateCount < 2) {
          continue;
        }
        
        if (part.match(/^\d{4}$/) && dateCount < 2) {
          continue;
        }
        
        if (part.match(/^\d{2}:\d{2}:\d{2}$/)) {
          continue;
        }
        
        if (part.length > 1 && part.match(/[A-Za-zА-Яа-я]/)) {
          descParts.push(part);
        }
      }
      
      description = descParts.join(' ').trim();
    } else {
      const parts = line.split(/\s{2,}|\t/).filter(p => p.trim().length > 0);
      let descParts = [];
      let foundDtKt = false;
      
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        
        if (part.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          continue;
        }
        
        if (part.match(/^\d+$/) && j < 4) {
          continue;
        }
        
        if (part.match(/Дт|Кт/i)) {
          foundDtKt = true;
          break;
        }
        
        if (!foundDtKt && part.length > 1 && !part.match(/^\d+[.,]\d+/) && !part.match(/^\d{2}\.\d{2}\.\d{4}/) && !part.match(/^\d{4}$/)) {
          if (part.match(/[A-Za-zА-Яа-я]/)) {
            descParts.push(part);
          }
        }
      }
      
      description = descParts.join(' ').trim();
    }
    
    if (!description || description.length < 2) {
      description = isIncome ? 'Превод' : 'Плащане';
    }
    
    description = description
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
    
    if (!isValidText(description)) {
      description = isIncome ? 'Превод' : 'Плащане';
    }
    
    const dateParts = dateStr.split('.');
    const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    
    const transactionKey = `${formattedDate}_${amount.toFixed(2)}_${description.substring(0, 30)}`;
    if (!seenTransactions.has(transactionKey)) {
      transactions.push({
        date: formattedDate,
        description: description,
        amount: amount,
        type: isIncome ? 'income' : 'expense'
      });
      seenTransactions.add(transactionKey);
    }
  }
  
  return transactions;
};

const parseBankStatementText = (text) => {
  if (!text || text.length < 10) {
    return [];
  }
  
  if (text.match(/tbi bank|Извлечение по сметка/i)) {
    return parseTBIBankStatement(text);
  }
  
  const isEURStatement = text.match(/EUR Statement|Account.*EUR/i);
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const transactions = [];
  const seenTransactions = new Set();
  
  const datePattern = /^(\w{3}\s+\d{1,2},\s+\d{4})/i;
  const amountPattern = /€\s*([\d.,]+)/gi;
  const bgnAmountPattern = /(\d+[.,]\d+)\s*BGN/gi;
  const moneyInPattern = /Money\s+in|Transfer\s+from|Exchanged\s+to|deposit|refund/i;
  const moneyOutPattern = /Money\s+out|Transfer\s+to|withdrawal|payment/i;
  
  const extractExchangeRate = (text) => {
    const rateMatch = text.match(/€1\.00\s*=\s*([\d.,]+)\s*BGN|Revolut Rate.*?([\d.,]+)\s*BGN/i);
    if (rateMatch) {
      const rate = parseFloat((rateMatch[1] || rateMatch[2]).replace(',', '.'));
      if (rate > 0 && rate < 10) {
        return rate;
      }
    }
    return null;
  };
  
  const defaultRate = 1.95583;
  let exchangeRate = extractExchangeRate(text) || defaultRate;
  
  const convertBGNToEUR = (bgnAmount) => {
    return bgnAmount / exchangeRate;
  };
  
  let skipUntilTransactions = true;
  let lastDate = null;
  let inTransactionTable = false;
  let foundHeader = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (skipUntilTransactions) {
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        if (line.match(/€\s*[\d.,]+/i)) {
          skipUntilTransactions = false;
          inTransactionTable = true;
          foundHeader = true;
        } else {
          for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
            const nextLine = lines[j];
            if (nextLine.match(/€\s*[\d.,]+/i)) {
              skipUntilTransactions = false;
              inTransactionTable = true;
              foundHeader = true;
              break;
            }
            if (nextLine.match(datePattern) && j > i + 5) {
              break;
            }
            if (nextLine.match(/Account transactions|transactions from|Date.*Description|EUR Statement/i)) {
              if (j > i + 10) {
                break;
              }
            }
          }
        }
      } else if (line.match(/Account transactions|transactions from|Date.*Description|EUR Statement/i)) {
        skipUntilTransactions = false;
        inTransactionTable = true;
        foundHeader = true;
      } else if (line.match(/^Date.*Description.*Money|^Date.*Money/i)) {
        skipUntilTransactions = false;
        inTransactionTable = true;
        foundHeader = true;
      }
      if (skipUntilTransactions) {
        continue;
      }
    }
    
    if (line.match(/Report lost|Get help|Scan the QR|Revolut Bank.*authorized.*deposit|©\s+\d{4}|End of statement/i)) {
      if (transactions.length > 0 && inTransactionTable) {
        break;
      }
      if (!inTransactionTable) {
        continue;
      }
    }
    
    if (line.match(/Generated on/i) && !line.match(/Date.*Description/i)) {
      if (!inTransactionTable) {
        continue;
      }
    }
    
    if (line.match(/Balance summary/i)) {
      if (transactions.length > 0) {
        break;
      }
      continue;
    }
    
    if (line.match(/^Date.*Description.*Money|^Date.*Money/i)) {
      inTransactionTable = true;
      continue;
    }
    
    if (line.match(/^Page\s+\d+\s+of\s+\d+/i)) {
      continue;
    }
    
    const dateMatch = line.match(datePattern);
    if (dateMatch && !inTransactionTable) {
      inTransactionTable = true;
    }
    
    if (!inTransactionTable && !dateMatch) {
      if (lastDate && line.match(/€\s*[\d.,]+/i)) {
        inTransactionTable = true;
      } else {
        continue;
      }
    }
    
    if (dateMatch && !inTransactionTable) {
      const hasEuro = line.match(/€\s*[\d.,]+/i);
      if (hasEuro) {
        inTransactionTable = true;
      } else {
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          if (lines[j].match(/€\s*[\d.,]+/i)) {
            inTransactionTable = true;
            break;
          }
          if (lines[j].match(datePattern)) {
            break;
          }
          if (lines[j].match(/Account transactions|transactions from|Date.*Description|EUR Statement/i)) {
            break;
          }
        }
      }
    }
    
    let dateStr = null;
    if (dateMatch) {
      dateStr = dateMatch[1];
      if (dateStr.match(/\w{3}\s+\d{1,2},\s+\d{4}/i)) {
        dateStr = parseRevolutDate(dateStr);
      }
      lastDate = dateStr;
    } else if (lastDate) {
      dateStr = lastDate;
    } else {
      continue;
    }
    
    let combinedLine = line;
    let nextLineIndex = i + 1;
    let linesToSkip = 0;
    
    let foundEuroInNextLines = false;
    while (nextLineIndex < lines.length && nextLineIndex < i + 15 && linesToSkip < 12) {
      const nextLine = lines[nextLineIndex];
      const nextDateMatch = nextLine.match(datePattern);
      
      if (nextDateMatch) {
        if (!foundEuroInNextLines) {
          break;
        }
      }
      
      if (nextLine.match(/Report lost|Get help|Scan the QR|Revolut Bank.*authorized.*deposit|©\s+\d{4}|Balance summary|^Date.*Description|^Page\s+\d+/i)) {
        if (!foundEuroInNextLines) {
          break;
        }
      }
      
      if (nextLine.length > 0 && !nextLine.match(/^\s*$/)) {
        const hasEuro = nextLine.match(/€\s*[\d.,]+/i);
        if (hasEuro) {
          foundEuroInNextLines = true;
        }
        
        if (nextLine.match(/^Card:|^Fee:|^Revolut Rate|^ECB rate|^To:|^Reference:|^From:/i)) {
          combinedLine = combinedLine + ' ' + nextLine;
          linesToSkip++;
        } else if (hasEuro) {
          combinedLine = combinedLine + ' ' + nextLine;
          linesToSkip++;
        } else if (!nextLine.match(/^\d+\.\d+\s*(?:BGN|USD|EUR|лв)$/i) && !nextLine.match(/^[\d.,\s€$£лвBGNUSDEUR]+$/i)) {
          if (!nextLine.match(/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}/i) && !nextLine.match(/^\d{4}$/)) {
            if (combinedLine.length < 300) {
              combinedLine = combinedLine + ' ' + nextLine;
              linesToSkip++;
            }
          }
        }
      }
      nextLineIndex++;
    }
    if (linesToSkip > 0) {
      i += linesToSkip;
    }
    
    const euroMatches = [];
    amountPattern.lastIndex = 0;
    let match;
    while ((match = amountPattern.exec(combinedLine)) !== null) {
      const amountStr = match[1].replace(/\s+/g, '').replace(',', '.');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0.001 && amount < 1000000) {
        euroMatches.push({
          amount: amount,
          index: match.index
        });
      }
    }
    amountPattern.lastIndex = 0;
    
    if (euroMatches.length === 0) {
      if (dateMatch && combinedLine.length > 10) {
        const simpleAmountMatch = combinedLine.match(/\b(\d{1,3}[.,]\d{2})\b/g);
        if (simpleAmountMatch) {
          for (const amtStr of simpleAmountMatch) {
            const amt = parseFloat(amtStr.replace(',', '.'));
            if (!isNaN(amt) && amt > 0.01 && amt < 1000000) {
              euroMatches.push({
                amount: amt,
                index: combinedLine.indexOf(amtStr)
              });
            }
          }
        }
        
        if (euroMatches.length === 0 && nextLineIndex < lines.length) {
          for (let j = nextLineIndex; j < Math.min(nextLineIndex + 5, lines.length); j++) {
            const nextLine = lines[j];
            if (nextLine.match(datePattern)) {
              break;
            }
            if (nextLine.match(/Report lost|Get help|Scan the QR|Revolut Bank.*authorized|©\s+\d{4}|Balance summary|^Date.*Description|^Page\s+\d+/i)) {
              break;
            }
            
            amountPattern.lastIndex = 0;
            let nextMatch;
            while ((nextMatch = amountPattern.exec(nextLine)) !== null) {
              const amountStr = nextMatch[1].replace(/\s+/g, '').replace(',', '.');
              const amount = parseFloat(amountStr);
              if (!isNaN(amount) && amount > 0.001 && amount < 1000000) {
                euroMatches.push({
                  amount: amount,
                  index: nextMatch.index
                });
                combinedLine = combinedLine + ' ' + nextLine;
                if (j > i) {
                  i += (j - i);
                }
                break;
              }
            }
            amountPattern.lastIndex = 0;
            if (euroMatches.length > 0) {
              break;
            }
          }
        }
      }
      if (euroMatches.length === 0) {
        continue;
      }
    }
    
    const euroAmounts = euroMatches.map(m => m.amount);
    
    const lineLower = combinedLine.toLowerCase();
    const hasMoneyInKeyword = moneyInPattern.test(combinedLine);
    const hasMoneyOutKeyword = moneyOutPattern.test(combinedLine);
    
    let transactionAmount = null;
    let isIncome = false;
    
    const tablePattern = /^(\w{3}\s+\d{1,2},\s+\d{4})\s+(.+?)(?:\s+€\s*([\d.,]+))?(?:\s+€\s*([\d.,]+))?(?:\s+€\s*([\d.,]+))?/i;
    const tablePatternFlexible = /^(\w{3}\s+\d{1,2},\s+\d{4})\s+(.+?)(?:€\s*([\d.,]+))?(?:\s+€\s*([\d.,]+))?(?:\s+€\s*([\d.,]+))?/i;
    const tableMatch = combinedLine.match(tablePattern) || combinedLine.match(tablePatternFlexible);
    
    if (tableMatch && euroMatches.length >= 1) {
      const moneyOut = tableMatch[3];
      const moneyIn = tableMatch[4];
      const balance = tableMatch[5];
      
      const isLikelyIncome = hasMoneyInKeyword || lineLower.includes('transfer from') || lineLower.includes('exchanged to') || lineLower.includes('exchanged eur') || lineLower.includes('deposit') || lineLower.includes('apple pay') || lineLower.includes('refund') || lineLower.includes('revolut bank') || (lineLower.includes('revolut user') && lineLower.includes('from'));
      const isLikelyExpense = hasMoneyOutKeyword || lineLower.includes('transfer to') || lineLower.includes('withdrawal') || lineLower.includes('payment') || lineLower.includes('cash withdrawal');
      
      if (moneyIn && moneyIn !== '0.00' && moneyIn !== '' && (!moneyOut || moneyOut === '0.00' || moneyOut === '')) {
        transactionAmount = parseFloat(moneyIn.replace(/\s+/g, '').replace(',', '.'));
        isIncome = true;
      } else if (moneyOut && moneyOut !== '0.00' && moneyOut !== '' && (!moneyIn || moneyIn === '0.00' || moneyIn === '')) {
        transactionAmount = parseFloat(moneyOut.replace(/\s+/g, '').replace(',', '.'));
        isIncome = false;
      } else if (moneyIn && moneyIn !== '0.00' && moneyIn !== '' && moneyOut && moneyOut !== '0.00' && moneyOut !== '') {
        if (isLikelyIncome && !isLikelyExpense) {
          transactionAmount = parseFloat(moneyIn.replace(/\s+/g, '').replace(',', '.'));
          isIncome = true;
        } else if (isLikelyExpense && !isLikelyIncome) {
          transactionAmount = parseFloat(moneyOut.replace(/\s+/g, '').replace(',', '.'));
          isIncome = false;
        } else {
          transactionAmount = parseFloat(moneyOut.replace(/\s+/g, '').replace(',', '.'));
          isIncome = false;
        }
      } else if (moneyIn && moneyIn !== '0.00' && moneyIn !== '') {
        transactionAmount = parseFloat(moneyIn.replace(/\s+/g, '').replace(',', '.'));
        isIncome = true;
      } else if (moneyOut && moneyOut !== '0.00' && moneyOut !== '') {
        transactionAmount = parseFloat(moneyOut.replace(/\s+/g, '').replace(',', '.'));
        isIncome = false;
      } else {
        const parts = combinedLine.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p.length > 0);
        const euroParts = [];
        
        for (let j = 0; j < parts.length; j++) {
          const euroMatch = parts[j].match(/€\s*([\d.,]+)/i);
          if (euroMatch) {
            euroParts.push({
              index: j,
              amount: parseFloat(euroMatch[1].replace(/\s+/g, '').replace(',', '.'))
            });
          }
        }
        
        if (euroParts.length === 0) {
          continue;
        }
        
        if (euroParts.length === 1) {
          transactionAmount = euroParts[0].amount;
          if (hasMoneyInKeyword || lineLower.includes('transfer from') || lineLower.includes('exchanged to') || lineLower.includes('exchanged eur') || lineLower.includes('deposit') || lineLower.includes('apple pay') || lineLower.includes('refund') || lineLower.includes('revolut bank') || (lineLower.includes('revolut user') && lineLower.includes('from'))) {
            isIncome = true;
          } else if (hasMoneyOutKeyword || lineLower.includes('transfer to') || lineLower.includes('withdrawal') || lineLower.includes('payment') || lineLower.includes('cash withdrawal')) {
            isIncome = false;
          } else {
            isIncome = false;
          }
        } else if (euroParts.length >= 2) {
          const firstAmount = euroParts[0].amount;
          const secondAmount = euroParts[1].amount;
          
          if (hasMoneyInKeyword && !hasMoneyOutKeyword) {
            transactionAmount = secondAmount || firstAmount;
            isIncome = true;
          } else if (hasMoneyOutKeyword && !hasMoneyInKeyword) {
            transactionAmount = firstAmount;
            isIncome = false;
          } else if (lineLower.includes('transfer from') || lineLower.includes('exchanged to') || lineLower.includes('exchanged eur') || lineLower.includes('deposit') || lineLower.includes('apple pay') || lineLower.includes('refund') || lineLower.includes('revolut bank') || (lineLower.includes('revolut user') && lineLower.includes('from'))) {
            transactionAmount = secondAmount || firstAmount;
            isIncome = true;
          } else if (lineLower.includes('transfer to') || lineLower.includes('withdrawal') || lineLower.includes('payment') || lineLower.includes('cash withdrawal')) {
            transactionAmount = firstAmount;
            isIncome = false;
          } else {
            if (firstAmount > 0 && (secondAmount === 0 || !secondAmount)) {
              transactionAmount = firstAmount;
              isIncome = false;
            } else if (secondAmount > 0 && (firstAmount === 0 || !firstAmount)) {
              transactionAmount = secondAmount;
              isIncome = true;
            } else if (firstAmount > 0 && secondAmount > 0) {
              transactionAmount = firstAmount;
              isIncome = false;
            } else {
              transactionAmount = firstAmount;
              isIncome = false;
            }
          }
        }
      }
    } else {
      if (euroAmounts.length === 1) {
        transactionAmount = euroAmounts[0];
        if (hasMoneyInKeyword || lineLower.includes('transfer from') || lineLower.includes('exchanged to') || lineLower.includes('exchanged eur') || lineLower.includes('deposit') || lineLower.includes('apple pay') || lineLower.includes('refund')) {
          isIncome = true;
        } else if (hasMoneyOutKeyword || lineLower.includes('transfer to') || lineLower.includes('withdrawal') || lineLower.includes('payment') || lineLower.includes('cash withdrawal')) {
          isIncome = false;
        } else {
          isIncome = false;
        }
      } else if (euroAmounts.length >= 2) {
        if (hasMoneyInKeyword && !hasMoneyOutKeyword) {
          transactionAmount = euroAmounts[euroAmounts.length - 1];
          isIncome = true;
        } else if (hasMoneyOutKeyword && !hasMoneyInKeyword) {
          transactionAmount = euroAmounts[0];
          isIncome = false;
        } else if (lineLower.includes('transfer from') || lineLower.includes('exchanged to') || lineLower.includes('exchanged eur') || lineLower.includes('deposit') || lineLower.includes('apple pay') || lineLower.includes('refund') || lineLower.includes('revolut bank') || (lineLower.includes('revolut user') && lineLower.includes('from'))) {
          if (euroAmounts.length >= 2) {
            if (euroAmounts[0] < 0.01 || (euroAmounts[1] > euroAmounts[0] * 1.5 && euroAmounts[1] > 5)) {
              transactionAmount = euroAmounts[1];
            } else {
              transactionAmount = euroAmounts[1];
            }
          } else {
            transactionAmount = euroAmounts[euroAmounts.length - 1];
          }
          isIncome = true;
        } else if (lineLower.includes('transfer to') && !lineLower.includes('transfer from')) {
          transactionAmount = euroAmounts[0];
          isIncome = false;
        } else {
          if (euroAmounts[0] < 0.01 && euroAmounts.length >= 2 && euroAmounts[1] > 0.01) {
            transactionAmount = euroAmounts[1];
            isIncome = true;
          } else {
            transactionAmount = euroAmounts[0];
            isIncome = false;
          }
        }
      }
    }
    
    if (!transactionAmount || transactionAmount <= 0) {
      continue;
    }
    
    let description = '';
    
    if (tableMatch && tableMatch[2]) {
      description = tableMatch[2];
    } else {
      const dateMatchForDesc = combinedLine.match(datePattern);
      if (dateMatchForDesc) {
        const dateEnd = combinedLine.indexOf(dateMatchForDesc[0]) + dateMatchForDesc[0].length;
        const afterDate = combinedLine.substring(dateEnd);
        const firstEuro = afterDate.search(/€\s*[\d.,]+/i);
        if (firstEuro >= 0) {
          description = afterDate.substring(0, firstEuro);
        } else {
          description = afterDate;
        }
      } else {
        description = combinedLine;
      }
    }
    
    description = description
      .replace(/Card:\s*\d+\*{3}\d+/gi, '')
      .replace(/Fee:\s*[€$£]\s*[\d.,]+/gi, '')
      .replace(/Revolut Rate.*/gi, '')
      .replace(/ECB rate.*/gi, '')
      .replace(/To:\s*/gi, '')
      .replace(/Reference:\s*/gi, '')
      .replace(/From:\s*/gi, '')
      .replace(/\d+\.\d+\s*(?:BGN|USD|EUR|лв)/gi, '')
      .replace(/€\s*[\d.,]+/gi, '')
      .replace(/Money\s+out/gi, '')
      .replace(/Money\s+in/gi, '')
      .replace(/Balance/gi, '')
      .replace(/\b\d{6,}\b/g, '')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u0400-\u04FF\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!description || description.length < 2) {
      if (hasMoneyInKeyword || isIncome) {
        description = 'Transfer';
      } else {
        description = 'Payment';
      }
    }
    
    description = description.substring(0, 200);
    
    if (!isValidText(description)) {
      description = (hasMoneyInKeyword || isIncome) ? 'Transfer' : 'Payment';
    }
    
    const cleanDesc = description.replace(/\s+/g, ' ').substring(0, 50).trim();
    
    let finalAmount = transactionAmount;
    if (!isEURStatement) {
      const descLower = cleanDesc.toLowerCase();
      if (descLower.includes('= bgn') || descLower.includes('bgn') || combinedLine.match(/\d+\.\d+\s*BGN/i)) {
        finalAmount = convertBGNToEUR(transactionAmount);
      }
    }
    
    const transactionKey = `${dateStr}_${finalAmount.toFixed(2)}_${cleanDesc}`;
    if (!seenTransactions.has(transactionKey)) {
      transactions.push({
        date: dateStr,
        description: cleanDesc,
        amount: finalAmount,
        type: isIncome ? 'income' : 'expense'
      });
      seenTransactions.add(transactionKey);
    }
  }
  
  const fallbackProcessed = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      const fallbackKey = `${i}_${line.substring(0, 50)}`;
      if (fallbackProcessed.has(fallbackKey)) {
        continue;
      }
      fallbackProcessed.add(fallbackKey);
      
      let combinedLineForFallback = line;
      let foundAmountInNextLines = false;
      
      if (line.match(/€\s*[\d.,]+/i)) {
        foundAmountInNextLines = true;
      }
      
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.match(datePattern)) {
          break;
        }
        if (nextLine.match(/Report lost|Get help|Scan the QR|Revolut Bank.*authorized.*deposit|©\s+\d{4}|Balance summary|^Date.*Description|^Page\s+\d+/i)) {
          break;
        }
        if (nextLine.match(/€\s*[\d.,]+/i)) {
          combinedLineForFallback = combinedLineForFallback + ' ' + nextLine;
          foundAmountInNextLines = true;
          if (j < i + 6) {
            break;
          }
        } else if (nextLine.length > 5 && nextLine.length < 150 && !nextLine.match(/^\d+\.\d+\s*(?:BGN|USD|EUR|лв)$/i) && !nextLine.match(/^[\d.,\s€$£лвBGNUSDEUR]+$/i)) {
          combinedLineForFallback = combinedLineForFallback + ' ' + nextLine;
        }
      }
      
      const euroMatches = [];
      amountPattern.lastIndex = 0;
      let match;
      while ((match = amountPattern.exec(combinedLineForFallback)) !== null) {
        const amountStr = match[1].replace(/\s+/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0.001 && amount < 1000000) {
          euroMatches.push(amount);
        }
      }
      amountPattern.lastIndex = 0;
      
      if (euroMatches.length === 0) {
        const simpleAmountMatch = combinedLineForFallback.match(/\b(\d{1,3}[.,]\d{2})\b/g);
        if (simpleAmountMatch) {
          for (const amtStr of simpleAmountMatch) {
            const amt = parseFloat(amtStr.replace(',', '.'));
            if (!isNaN(amt) && amt > 0.01 && amt < 1000000) {
              euroMatches.push(amt);
            }
          }
        }
      }
      
      if (euroMatches.length > 0) {
        const dateStr = dateMatch[1];
        const parsedDate = parseRevolutDate(dateStr);
        const lineLowerFallback = combinedLineForFallback.toLowerCase();
        const isIncome = moneyInPattern.test(combinedLineForFallback) || lineLowerFallback.includes('transfer from') || lineLowerFallback.includes('exchanged to') || lineLowerFallback.includes('exchanged eur') || lineLowerFallback.includes('deposit') || lineLowerFallback.includes('apple pay') || lineLowerFallback.includes('refund') || lineLowerFallback.includes('revolut bank') || (lineLowerFallback.includes('revolut user') && lineLowerFallback.includes('from'));
        
        let amount;
        if (euroMatches.length >= 2 && isIncome) {
          amount = euroMatches[1] || euroMatches[0];
        } else if (euroMatches.length >= 2 && !isIncome) {
          amount = euroMatches[0];
        } else {
          amount = euroMatches[0];
        }
        
        let desc = combinedLineForFallback.replace(datePattern, '').replace(/€\s*[\d.,]+/gi, '').replace(/Card:|Fee:|Revolut Rate|ECB rate|To:|Reference:|From:/gi, '').trim().substring(0, 50);
        if (!desc || desc.length < 2) {
          desc = isIncome ? 'Transfer' : 'Payment';
        }
        
        let finalAmount = amount;
        if (!isEURStatement) {
          const descLower = desc.toLowerCase();
          if (descLower.includes('= bgn') || descLower.includes('bgn') || combinedLineForFallback.match(/\d+\.\d+\s*BGN/i)) {
            finalAmount = convertBGNToEUR(amount);
          }
        }
        
        const transactionKey = `${parsedDate}_${finalAmount.toFixed(2)}_${desc}`;
        if (!seenTransactions.has(transactionKey)) {
          const existingTransaction = transactions.find(t => {
            const tDate = t.date;
            return tDate === parsedDate && Math.abs(t.amount - finalAmount) < 0.01 && t.description.toLowerCase().includes(desc.toLowerCase().substring(0, 15));
          });
          
          if (!existingTransaction) {
            transactions.push({
              date: parsedDate,
              description: desc,
              amount: finalAmount,
              type: isIncome ? 'income' : 'expense'
            });
            seenTransactions.add(transactionKey);
          }
        }
      }
    }
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


const importCSVTransactions = async (userId, filePath, options = {}) => {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    let rows = [];
    
    let expectedTotal = null;
    let parsedTransactions = [];
    let pdfText = null;
    
    if (fileExt === '.pdf') {
      try {
        pdfText = await extractTextFromPDF(filePath);
        const isTBIStatement = !!pdfText.match(/tbi bank|Извлечение по сметка/i);
        const isRevolutStatement = !!pdfText.match(/Revolut Bank|EUR Statement|Account transactions|Money out|Money in/i);

        const aiKey = process.env.HF_STMT_API_KEY || process.env.HF_TXN_API_KEY;
        const aiModel = process.env.HF_STMT_MODEL;

        if (!aiKey || !aiModel) {
          return {
            success: false,
            error: 'AI PDF import is enabled but not configured. Please set HF_STMT_MODEL and HF_STMT_API_KEY (or HF_TXN_API_KEY).'
          };
        }

        let aiError = null;
        let aiParsed = [];
        let fallbackParsed = [];
        
        try {
          aiParsed = await parseStatementWithAI(pdfText, { apiKey: aiKey, model: aiModel });
        } catch (e) {
          aiError = e;
        }
        
        try {
          fallbackParsed = parseBankStatementText(pdfText);
        } catch (e) {
        }
        
        const seenKeys = new Set();
        parsedTransactions = [];
        
        for (const tx of aiParsed) {
          const key = `${tx.date}_${tx.amount.toFixed(2)}_${tx.description.substring(0, 30)}`;
          if (!seenKeys.has(key)) {
            parsedTransactions.push(tx);
            seenKeys.add(key);
    }
  }
  
        for (const tx of fallbackParsed) {
          const key = `${tx.date}_${tx.amount.toFixed(2)}_${tx.description.substring(0, 30)}`;
          if (!seenKeys.has(key)) {
            parsedTransactions.push(tx);
            seenKeys.add(key);
          }
  }
  
        if (parsedTransactions.length === 0 && aiError) {
          return {
            success: false,
            error: `AI PDF parsing failed (${aiError.message}). Fallback parsing also found no transactions.`
          };
  }
  
        if (parsedTransactions.length === 0) {
          return {
            success: false,
            error: aiError
              ? `AI PDF parsing failed (${aiError.message}). Try a different HF_STMT_MODEL (some models return 410 on the public endpoint).`
              : 'No transactions found in PDF. The PDF might be in an unsupported format or contain no readable transaction data.'
          };
        }
        
        const balanceSummaryMatch = isRevolutStatement
          ? pdfText.match(/Money out.*?€\s*([\d.,]+).*?Money in.*?€\s*([\d.,]+)/is)
          : null;
        if (balanceSummaryMatch) {
          const totalOut = parseFloat(balanceSummaryMatch[1].replace(/\s+/g, '').replace(',', '.'));
          const totalIn = parseFloat(balanceSummaryMatch[2].replace(/\s+/g, '').replace(',', '.'));
          if (parsedTransactions.length > 0) {
            const totalAmount = parsedTransactions.reduce((sum, tx) => sum + tx.amount, 0);
            const avgTransaction = totalAmount / parsedTransactions.length;
            if (avgTransaction > 0) {
              expectedTotal = Math.round((totalOut + totalIn) / avgTransaction);
  }
          }
        }
        
        if (isTBIStatement) {
          expectedTotal = null;
        }
        
        rows = parsedTransactions.map(tx => {
          const descLower = (tx.description || '').toLowerCase();
          let finalType = tx.type;
          
          if (descLower.includes('transfer to') && !descLower.includes('transfer from')) {
            finalType = 'expense';
          } else if (descLower.includes('transfer from') && !descLower.includes('transfer to')) {
            finalType = 'income';
  }
  
          return {
            date: tx.date,
            amount: finalType === 'income' ? tx.amount.toString() : `-${tx.amount.toString()}`,
            description: tx.description,
            type: finalType
          };
        });
      } catch (error) {
        return {
          success: false,
          error: `PDF parsing error: ${error.message}`
        };
      }
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
      errors: [],
      missingTransactions: [],
      expectedTotal: expectedTotal
    };
    
    if (fileExt === '.pdf' && expectedTotal && expectedTotal > rows.length) {
      const missing = expectedTotal - rows.length;
      results.missingTransactions.push({
        reason: `Очаквани са приблизително ${expectedTotal} транзакции според баланса, но са намерени само ${rows.length}. Липсват ${missing} транзакции. Възможни причини: транзакции с нестандартен формат, транзакции на втората страница, или транзакции без ясно разпознаваема € сума.`
      });
    }
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const normalized = normalizeCSVRow(row);
      
      let amount = parseAmount(normalized.amount);
      
      const extractExchangeRate = (text) => {
        if (!text) return null;
        const rateMatch = text.match(/€1\.00\s*=\s*([\d.,]+)\s*BGN|Revolut Rate.*?([\d.,]+)\s*BGN|(\d+[.,]\d+)\s*BGN\s*\(([\d.,]+)\s*EUR\)/i);
        if (rateMatch) {
          if (rateMatch[3] && rateMatch[4]) {
            const bgn = parseFloat(rateMatch[3].replace(',', '.'));
            const eur = parseFloat(rateMatch[4].replace(',', '.'));
            if (bgn > 0 && eur > 0) {
              return bgn / eur;
            }
          }
          const rate = parseFloat((rateMatch[1] || rateMatch[2]).replace(',', '.'));
          if (rate && rate > 0 && rate < 10) {
            return rate;
          }
        }
        return null;
      };
      
      const isEURStatement = pdfText?.match(/EUR Statement|Account.*EUR/i);
      const isTBIStatement = pdfText?.match(/tbi bank|Извлечение по сметка/i);
      
      if (fileExt !== '.pdf' && !isEURStatement && !isTBIStatement) {
        const defaultRate = 1.95583;
        const exchangeRate = extractExchangeRate(pdfText) || defaultRate;
        
        const convertBGNToEUR = (bgnAmount) => bgnAmount / exchangeRate;
        
        const descriptionLower = (normalized.description || '').toLowerCase();
        if (descriptionLower.match(/= bgn|bgn$/i)) {
          const absAmount = Math.abs(amount);
          amount = convertBGNToEUR(absAmount);
          if (normalized.type === 'expense' || amount < 0) {
            amount = -Math.abs(amount);
          } else if (normalized.type === 'income') {
            amount = Math.abs(amount);
      }
        }
      }
      
      if (normalized.type === 'income' && amount < 0) {
        amount = Math.abs(amount);
      } else if (normalized.type === 'expense' && amount > 0) {
        amount = -Math.abs(amount);
      } else if (!normalized.type) {
        if (amount > 0) {
          amount = -Math.abs(amount);
        }
      }
      
      if (amount === 0) {
        results.skipped++;
        continue;
      }
      
      let description = normalized.description || '';
      description = cleanDescription(description);
      
      if (!description || description.trim().length < 2 || !isValidText(description)) {
        const merchantAttempt = extractMerchantName(String(normalized.amount));
        if (merchantAttempt && isValidText(merchantAttempt)) {
          description = merchantAttempt;
        } else {
          description = 'Без описание';
        }
      } else {
        const merchantAttempt = extractMerchantName(description);
        if (merchantAttempt && isValidText(merchantAttempt) && merchantAttempt.length > 2) {
          description = merchantAttempt;
        } else if (isValidText(description) && description.length > 2) {
          description = description;
        } else {
          description = 'Без описание';
        }
      }
      
      description = cleanDescription(description);
      
      if (!description || description.length < 2 || !isValidText(description)) {
        description = 'Без описание';
      }
      
      const transactionDate = parseDate(normalized.date);
      const formatDateLocal = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      let transactionType = amount < 0 ? 'expense' : 'income';
      
      if (normalized.type) {
        transactionType = normalized.type;
      }
      
      const absAmount = Math.abs(amount);
      
      let categorization;
      const descLower = description.toLowerCase();
      
      if (descLower.includes('transfer') || descLower.includes('revolut user')) {
        const transferCategory = await ensureCategoryExists('Трансфери', transactionType);
        categorization = {
          success: true,
          result: {
            categoryId: transferCategory.id,
            categoryName: transferCategory.name,
            type: transactionType
          }
        };
      } else {
        try {
          const categorizationOptions = {
            openaiApiKey: process.env.OPENAI_API_KEY,
            openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            transactionType: transactionType,
            userId
          };
          categorization = await categorizeTransaction(description, absAmount, categorizationOptions);
      
          if (categorization.success && categorization.result) {
            if (categorization.result.type !== transactionType) {
              categorization.result.type = transactionType;
            }
          }
        } catch (error) {
          categorization = { success: false, error: error.message };
        }
        
        if (!categorization.success || !categorization.result) {
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
      }
      
      if (categorization.success && categorization.result) {
        const fixedCategoryId = await ensureCategoryIdMatchesType(
          categorization.result.categoryId,
          transactionType
        );
        
        if (!fixedCategoryId) {
          const fallbackName = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
          const fallback = await ensureCategoryExists(fallbackName, transactionType);
          categorization.result.categoryId = fallback.id;
          categorization.result.categoryName = fallback.name;
        } else {
          if (fixedCategoryId !== categorization.result.categoryId) {
            const fixedCategory = await FinancialCategory.findByPk(fixedCategoryId);
            categorization.result.categoryId = fixedCategoryId;
            categorization.result.categoryName = fixedCategory.name;
          }
        }
        categorization.result.type = transactionType;
      }
      
      description = cleanDescription(description);
      if (!description || !isValidText(description) || description.length < 2) {
        description = 'Без описание';
      }
      
      const finalTransactionType = transactionType;
      
      const transactionData = {
        category_id: categorization.result.categoryId,
        amount: amount,
        description: description,
        transaction_date: formatDateLocal(transactionDate),
        type: finalTransactionType,
        source: 'CSV Import'
      };
      
      const existingTransaction = await FinancialTransaction.findOne({
        where: {
          user_id: userId,
          transaction_date: transactionData.transaction_date,
          amount: {
            [Op.between]: [amount - 0.01, amount + 0.01]
          },
          description: {
            [Op.like]: `%${description.substring(0, 30)}%`
          }
        }
      });
      
      if (existingTransaction) {
        results.skipped++;
        continue;
      }
      
      const createResult = await createTransaction(userId, transactionData);
      
      if (createResult.success) {
        results.imported++;
      } else {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: createResult.error,
          description,
          date: formatDateLocal(transactionDate),
          amount: absAmount.toFixed(2) + ' €'
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
