const { FinancialCategory } = require('../../models');
const crypto = require('crypto');
const { AICache } = require('../../models');
const axios = require('axios');
const { Op } = require('sequelize');

const CACHE_HOURS = 24;
const CATEGORY_CACHE_VERSION = 'v2';
const MERCHANT_RULE_VERSION = 'v1';

const generateCacheKey = (text, type) => {
  const hash = crypto.createHash('sha256').update(`${type}:${text}`).digest('hex');
  return `transaction_category_${CATEGORY_CACHE_VERSION}_${hash}`;
};

const normalizeMerchantKey = (description) => {
  if (!description) return null;
  const extracted = extractMerchantName(String(description));
  const base = (extracted?.merchantName || description || '').toString().toLowerCase();
  const cleaned = base
    .replace(/[\d.,]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const stopWords = new Set(['в', 'на', 'от', 'до', 'за', 'с', 'при', 'at', 'in', 'on', 'for', 'with', 'from', 'to']);
  const words = cleaned.split(' ').filter(w => w && !stopWords.has(w));
  if (words.length === 0) return null;
  return words.slice(0, 3).join(' ');
};

const merchantRuleCacheKey = (userId, transactionType, merchantKey) => {
  const hash = crypto.createHash('sha256').update(`${userId}:${transactionType}:${merchantKey}`).digest('hex');
  return `merchant_override_${MERCHANT_RULE_VERSION}_${hash}`;
};

const getMerchantOverride = async (userId, transactionType, merchantKey) => {
  if (!userId || !transactionType || !merchantKey) return null;
  try {
    const cacheKey = merchantRuleCacheKey(userId, transactionType, merchantKey);
    const cached = await AICache.findOne({
      where: {
        cache_key: cacheKey,
        expires_at: { [Op.gt]: new Date() }
      }
    });
    return cached?.result || null;
  } catch (e) {
    return null;
  }
};

const setMerchantOverride = async (userId, transactionType, merchantKey, categoryId, categoryName) => {
  if (!userId || !transactionType || !merchantKey || !categoryId) return;
  try {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10);
    const cacheKey = merchantRuleCacheKey(userId, transactionType, merchantKey);
    await AICache.upsert({
      cache_key: cacheKey,
      result: { categoryId, categoryName: categoryName || null, type: transactionType, merchantKey },
      expires_at: expiresAt
    });
  } catch (e) {
  }
};

const getCachedResult = async (cacheKey) => {
  try {
    const cached = await AICache.findOne({
      where: {
        cache_key: cacheKey,
        expires_at: {
          [Op.gt]: new Date()
        }
      }
    });
    if (cached) {
      return cached.result;
    }
  } catch (error) {
  }
  return null;
};

const setCachedResult = async (cacheKey, result) => {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_HOURS);
    await AICache.upsert({
      cache_key: cacheKey,
      result,
      expires_at: expiresAt
    });
  } catch (error) {
  }
};

const extractMerchantName = (description) => {
  const text = description.toLowerCase().trim();
  const words = text.split(/\s+/);
  
  if (words.length === 0) return null;
  
  const amountPattern = /[\d.,]+/;
  const cleanText = text.replace(amountPattern, '').trim();
  const cleanWords = cleanText.split(/\s+/);
  
  const stopWords = ['в', 'на', 'от', 'до', 'за', 'с', 'при', 'at', 'in', 'on', 'for', 'with', 'from', 'to'];
  const filteredWords = cleanWords.filter(word => !stopWords.includes(word));
  
  const merchantName = filteredWords.slice(0, 3).join(' ').trim() || filteredWords[0] || cleanWords[0];
  
  return { 
    merchantName: merchantName,
    fullText: text,
    cleanText: cleanText
  };
};

const classifyMerchantWithOpenAI = async (merchantName, description, allCategories, apiKey, model) => {
  if (!apiKey || allCategories.length === 0) {
    return null;
  }

  try {
    const categoryList = allCategories.map(c => c.name).join(', ');
    const prompt = `Analyze this business/merchant and classify the transaction into the most appropriate category.

Merchant name: "${merchantName}"
Full description: "${description}"

Available categories: ${categoryList}

Rules:
- If merchant contains "pizza", "domino", "restaurant", "cafe", "food" -> classify as "Храна"
- If merchant contains "lukoil", "omv", "shell", "gas", "fuel", "бензин", "гориво" -> classify as "Гориво"
- If merchant contains "supermarket", "billa", "kaufland", "lidl", "fantastico", "магазин" -> classify as "Храна"
- If merchant contains "bank", "transfer", "трансфер" -> classify as "Преводи" or "Трансфери" if available
- If merchant contains "taxi", "uber", "bolt", "автобус", "метро" -> classify as "Транспорт"
- If merchant contains "apartment", "rent", "наем", "квартира" -> classify as "Наем"
- If merchant contains "utility", "electricity", "water", "комунални", "ток" -> classify as "Комунални"
- Analyze the business type and choose the most appropriate category from the list.

Return ONLY the category name that best matches.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert financial transaction classifier. Always return only the category name from the provided list, nothing else.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message?.content?.trim() || '';
      if (content) {
        const categoryName = content.split('\n')[0].trim().replace(/['"]/g, '');
        const matched = allCategories.find(c => {
          const catLower = c.name.toLowerCase();
          const contentLower = categoryName.toLowerCase();
          return catLower === contentLower || 
                 contentLower.includes(catLower) || 
                 catLower.includes(contentLower);
        });
    
        if (matched) {
    return {
      categoryId: matched.id,
      categoryName: matched.name,
      type: matched.type,
            confidence: 0.9,
            model: `openai-${model}`
    };
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const generateCategoryNameFromDescription = (description) => {
  if (!description || description.length < 2) {
    return null;
  }

  const descLower = description.toLowerCase().trim();
  
  const categoryPatterns = {
    'Гориво': ['lukoil', 'лукойл', 'omv', 'омв', 'shell', 'бензин', 'гориво', 'fuel', 'petrol', 'газ', 'газова', 'бензиностанция', 'автогара', 'автосервиз', 'petrol station', 'gas station'],
    'Храна': ['храна', 'ресторант', 'кафе', 'супермаркет', 'лидл', 'lidl', 'кауфланд', 'kaufland', 'била', 'billa', 'фантастико', 'fantastiko', 'fantastico', 'магазин', 'magazin', 'магазини', 'хранителни', 'продукти', 'пица', 'pizza', 'пицария', 'pizzeria', 'бургер', 'burger', 'кафене', 'макдоналдс', 'mcdonalds', 'kfc', 'домино', 'domino', 'dominos', 'доминос', 'restaurant', 'cafe', 'coffee', 'food', 'grocery', 'supermarket', 'tesco', 'теско', 'carrefour', 'карефур', 'metro', 'метро', 'dm', 'дм'],
    'Транспорт': ['транспорт', 'автобус', 'метро', 'такси', 'uber', 'bolt', 'паркинг', 'автомобил', 'кола', 'авто', 'car', 'bus', 'taxi', 'parking', 'transport', 'metro', 'subway'],
    'Наем': ['наем', 'наема', 'квартира', 'жилище', 'ипотека', 'rent', 'apartment', 'mortgage', 'жилищен'],
    'Комунални': ['комунални', 'ток', 'електричество', 'вода', 'телефон', 'интернет', 'телеком', 'виваком', 'vivacom', 'а1', 'a1', 'теленор', 'telenor', 'електроснабдяване', 'utility', 'electricity', 'water', 'phone', 'internet', 'electric'],
    'Забавление': ['забавление', 'кино', 'театър', 'концерт', 'клуб', 'бар', 'алкохол', 'билет', 'игра', 'игри', 'entertainment', 'cinema', 'theater', 'concert', 'club', 'bar', 'alcohol', 'ticket', 'game', 'games'],
    'Здраве': ['здраве', 'лекар', 'аптека', 'болница', 'лекарство', 'стоматолог', 'лечение', 'медицина', 'фармация', 'health', 'doctor', 'pharmacy', 'hospital', 'medicine', 'dentist', 'treatment', 'medical'],
    'Образование': ['образование', 'училище', 'университет', 'курс', 'обучение', 'книга', 'учебник', 'education', 'school', 'university', 'course', 'book', 'books'],
    'Обувки и дрехи': ['дрехи', 'обувки', 'мода', 'ризи', 'панталони', 'облекло', 'обувка', 'clothes', 'shoes', 'fashion', 'shirt', 'pants', 'clothing', 'apparel'],
    'Техника': ['техника', 'компютър', 'телефон', 'таблет', 'телевизор', 'електроника', 'софтуер', 'хардуер', 'tech', 'computer', 'phone', 'tablet', 'tv', 'electronics', 'software', 'hardware'],
    'Фитнес': ['фитнес', 'спорт', 'гимнастика', 'тренировка', 'fitness', 'gym', 'sport', 'sports', 'workout', 'exercise'],
    'Банкови такси': ['такси', 'комисионна', 'fee', 'bank fee', 'service fee', 'комисионна', 'банкова такса'],
    'Преводи': ['превод', 'exchange', 'конвертация', 'currency exchange', 'обмяна'],
    'Трансфери': ['transfer', 'трансфер', 'превод', 'payment transfer']
  };

  for (const [categoryName, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      const patternLower = pattern.toLowerCase();
      if (descLower.includes(patternLower)) {
        return categoryName;
      }
      const words = descLower.split(/\s+/);
      for (const word of words) {
        if (word === patternLower || word.startsWith(patternLower) || patternLower.startsWith(word)) {
          return categoryName;
    }
  }
    }
  }

  return null;
};

const classifyWithOpenAI = async (text, categories, apiKey, model) => {
  if (!apiKey || categories.length === 0) {
    return null;
  }

  try {
    const categoryList = categories.map(c => c.name).join(', ');
    const prompt = `Analyze this transaction and classify it into the most appropriate category.

Transaction description: "${text}"

Available categories: ${categoryList}

Consider:
- Business type (restaurant, gas station, supermarket, etc.)
- Transaction context (food purchase, fuel, transfer, etc.)
- Merchant name patterns

Return only the category name that best matches.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert financial transaction classifier. Always return only the category name from the provided list, nothing else.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message?.content?.trim() || '';
      if (content) {
        const categoryName = content.split('\n')[0].trim().replace(/['"]/g, '');
        const matched = categories.find(c => {
          const catLower = c.name.toLowerCase();
          const contentLower = categoryName.toLowerCase();
          return catLower === contentLower || 
                 contentLower.includes(catLower) || 
                 catLower.includes(contentLower) ||
                 catLower.split(' ').some(word => contentLower.includes(word)) ||
                 contentLower.split(' ').some(word => catLower.includes(word));
        });
    
        if (matched) {
    return {
      categoryId: matched.id,
      categoryName: matched.name,
      type: matched.type,
            confidence: 0.9,
            model: `openai-${model || 'gpt-4o-mini'}`
    };
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const getCategoryKeywords = () => {
  return {
    'Гориво': ['lukoil', 'лукойл', 'omv', 'омв', 'shell', 'бензин', 'гориво', 'fuel', 'petrol', 'газ', 'газова', 'бензиностанция', 'автогара', 'автосервиз'],
    'Храна': ['храна', 'ресторант', 'кафе', 'супермаркет', 'лидл', 'lidl', 'кауфланд', 'kaufland', 'била', 'billa', 'магазин', 'хранителни', 'продукти', 'пица', 'pizza', 'пицария', 'pizzeria', 'бургер', 'burger', 'кафене', 'макдоналдс', 'mcdonalds', 'kfc', 'домино', 'domino', 'dominos', 'доминос', 'ресторант', 'restaurant', 'кафене', 'cafe', 'кафе', 'coffee', 'minimart', 'mini mart', 'mini-mart'],
    'Транспорт': ['транспорт', 'автобус', 'метро', 'такси', 'uber', 'bolt', 'паркинг', 'автомобил', 'кола', 'авто', 'car', 'bus', 'taxi', 'parking'],
    'Наем': ['наем', 'наема', 'квартира', 'жилище', 'ипотека', 'rent', 'apartment', 'mortgage'],
    'Комунални': ['комунални', 'ток', 'електричество', 'вода', 'телефон', 'интернет', 'телеком', 'виваком', 'vivacom', 'а1', 'a1', 'теленор', 'telenor', 'електроснабдяване', 'utility', 'electricity', 'water', 'phone', 'internet'],
    'Забавление': ['забавление', 'кино', 'театър', 'концерт', 'клуб', 'бар', 'алкохол', 'билет', 'игра', 'игри', 'entertainment', 'cinema', 'theater', 'concert', 'club', 'bar', 'alcohol', 'ticket', 'game'],
    'Здраве': ['здраве', 'лекар', 'аптека', 'болница', 'лекарство', 'стоматолог', 'лечение', 'медицина', 'фармация', 'health', 'doctor', 'pharmacy', 'hospital', 'medicine', 'dentist', 'treatment'],
    'Образование': ['образование', 'училище', 'университет', 'курс', 'обучение', 'книга', 'учебник', 'education', 'school', 'university', 'course', 'book'],
    'Обувки и дрехи': ['дрехи', 'обувки', 'мода', 'ризи', 'панталони', 'облекло', 'обувка', 'clothes', 'shoes', 'fashion', 'shirt', 'pants', 'clothing'],
    'Техника': ['техника', 'компютър', 'телефон', 'таблет', 'телевизор', 'електроника', 'софтуер', 'хардуер', 'tech', 'computer', 'phone', 'tablet', 'tv', 'electronics', 'software', 'hardware'],
    'Заплата': ['заплата', 'заплатa', 'заплат', 'зарплата', 'зарплатa', 'зарплат', 'salary', 'wage', 'pay'],
    'Бонуси': ['бонус', 'премия', 'награда', 'bonus', 'premium', 'reward'],
    'Банкови такси': ['fee', 'bank fee', 'service fee', 'commission', 'комисионна', 'банкова такса', 'такса', 'такси', 'unicredit', 'bulbank', 'unicreditbulbank', 'ubb', 'united bulgarian bank', 'банка', 'банкомат'],
    'Теглене': ['atm', 'ubbatm', 'cash withdrawal', 'withdrawal', 'банкомат', 'теглене', 'atm withdrawal', 'cashout'],
    'Инвестиции': ['инвестиция', 'акции', 'облигации', 'депозит', 'investment', 'stocks', 'bonds', 'deposit'],
    'Фрийланс': ['фрийланс', 'freelance', 'проект', 'клиент', 'project', 'client']
  };
};

const categorizeWithKeywords = async (description, amount) => {
  const textLower = description.toLowerCase().trim();
  const textCompact = textLower.replace(/[^a-zа-я0-9]+/gi, '');
  const keywords = getCategoryKeywords();
  const categoryScores = [];

  for (const [categoryName, categoryKeywords] of Object.entries(keywords)) {
    let score = 0;
    for (const keyword of categoryKeywords) {
      const keywordLower = keyword.toLowerCase();
      const keywordCompact = keywordLower.replace(/[^a-zа-я0-9]+/gi, '');
      if (textLower === keywordLower) {
        score += 1.0;
      } else if (textLower.includes(keywordLower)) {
        score += 0.5;
      } else if (keywordCompact && textCompact.includes(keywordCompact)) {
        score += 0.4;
      } else {
        const words = textLower.split(/\s+/);
        for (const word of words) {
          if (word === keywordLower || word.startsWith(keywordLower) || keywordLower.startsWith(word)) {
        score += 0.3;
            break;
          }
        }
      }
    }
    if (score > 0) {
      categoryScores.push({ categoryName, score });
    }
  }

  categoryScores.sort((a, b) => b.score - a.score);

  if (categoryScores.length > 0 && categoryScores[0].score >= 0.2) {
    return categoryScores[0].categoryName;
  }

  return null;
};

const determineTransactionType = (amount, description) => {
  const amountNum = parseFloat(amount);
  if (amountNum < 0) {
    return 'expense';
  }
  const descLower = description.toLowerCase();
  const incomeKeywords = ['заплата', 'зарплата', 'бонус', 'премия', 'инвестиция', 'депозит', 'фрийланс'];
  for (const keyword of incomeKeywords) {
    if (descLower.includes(keyword)) {
      return 'income';
    }
  }
  return 'expense';
};

const categorizeTransaction = async (description, amount, options = {}) => {
  const text = description.trim();
  if (!text || text.length < 2) {
    return { success: false, error: 'Description too short' };
  }

  const transactionType = options.transactionType || determineTransactionType(amount, description);
  const userId = options.userId;
  const merchantKey = normalizeMerchantKey(description);

  if (userId && merchantKey) {
    const override = await getMerchantOverride(userId, transactionType, merchantKey);
    if (override && override.categoryId) {
      const category = await FinancialCategory.findByPk(override.categoryId);
      if (category && category.type === transactionType) {
        return {
          success: true,
          result: { categoryId: category.id, categoryName: category.name, type: transactionType, merchantKey },
          fromCache: true,
          source: 'merchant_override'
        };
      }
    }
  }

  const cacheKey = generateCacheKey(text, transactionType);
  const cached = await getCachedResult(cacheKey);
  
  if (cached) {
    const category = await FinancialCategory.findByPk(cached.categoryId);
    if (category && category.type === transactionType) {
    return { success: true, result: cached, fromCache: true };
    }
  }

  try {
    const allCategories = await FinancialCategory.findAll({ where: { is_active: true } });
    
    if (allCategories.length === 0) {
      return { success: false, error: 'No categories found in database' };
    }

    const typeCategories = allCategories.filter(c => c.type === transactionType);

    const extracted = extractMerchantName(description);
    const openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    const openaiModel = options.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (openaiApiKey && extracted && extracted.merchantName) {
      try {
        const merchantResult = await classifyMerchantWithOpenAI(
          extracted.merchantName,
          description,
          typeCategories.map(c => ({ id: c.id, name: c.name, type: c.type })),
          openaiApiKey,
          openaiModel
        );

        if (merchantResult && merchantResult.categoryId) {
          const foundCategory = await FinancialCategory.findByPk(merchantResult.categoryId);
          if (foundCategory && foundCategory.type === transactionType) {
            merchantResult.type = transactionType;
          await setCachedResult(cacheKey, merchantResult);
            if (userId && merchantKey) {
              await setMerchantOverride(userId, transactionType, merchantKey, merchantResult.categoryId, merchantResult.categoryName);
            }
          return { success: true, result: merchantResult, fromCache: false };
          }
        }
      } catch (error) {
      }
    }

    let mlResult = null;
    if (openaiApiKey && typeCategories.length > 0) {
      try {
        mlResult = await classifyWithOpenAI(
          description,
          typeCategories.map(c => ({ id: c.id, name: c.name, type: c.type })),
          openaiApiKey,
          openaiModel
        );
      } catch (error) {
      }
    }

    if (mlResult && mlResult.categoryId) {
      // Verify the category type matches transaction type
      const foundCategory = await FinancialCategory.findByPk(mlResult.categoryId);
      if (foundCategory && foundCategory.type === transactionType) {
        mlResult.type = transactionType;
      await setCachedResult(cacheKey, mlResult);
      return { success: true, result: mlResult, fromCache: false };
    }
      // If category type doesn't match, continue to try keywords/default
    }

    let categoryName = await categorizeWithKeywords(description, amount);

    if (!categoryName) {
      const generatedCategoryName = generateCategoryNameFromDescription(description);
      
      if (generatedCategoryName && generatedCategoryName.length > 1) {
        categoryName = generatedCategoryName;
      }
    }

    if (!categoryName) {
      const defaultCategory = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
      let category = await FinancialCategory.findOne({
        where: { name: defaultCategory, type: transactionType, is_active: true }
      });
      
      if (!category) {
        category = await FinancialCategory.create({
          name: defaultCategory,
          type: transactionType,
          icon: null,
          color: null,
          is_active: true
        });
      }
      
        const result = { categoryId: category.id, categoryName: category.name, type: transactionType };
        await setCachedResult(cacheKey, result);
        return { success: true, result, fromCache: false };
    }

    let category = await FinancialCategory.findOne({
      where: { name: categoryName, is_active: true }
    });

    if (!category) {
      // Create category with the correct transaction type
      category = await FinancialCategory.create({
        name: categoryName,
        type: transactionType,
        icon: null,
        color: null,
        is_active: true
      });
    } else if (category.type !== transactionType) {
      // If existing category has wrong type, use default category instead
      const defaultCategory = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
      category = await FinancialCategory.findOne({
        where: { name: defaultCategory, type: transactionType, is_active: true }
      });
      
      if (!category) {
        category = await FinancialCategory.create({
          name: defaultCategory,
          type: transactionType,
          icon: null,
          color: null,
          is_active: true
        });
      }
    }

    const result = { categoryId: category.id, categoryName: category.name, type: transactionType };
    await setCachedResult(cacheKey, result);
    return { success: true, result, fromCache: false };

  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  categorizeTransaction,
  normalizeMerchantKey,
  setMerchantOverride
};

