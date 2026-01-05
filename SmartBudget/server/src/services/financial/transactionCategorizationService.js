const { FinancialCategory } = require('../../models');
const crypto = require('crypto');
const { AICache } = require('../../models');
const axios = require('axios');

const CACHE_HOURS = 24;

const generateCacheKey = (text, type) => {
  const hash = crypto.createHash('sha256').update(`${type}:${text}`).digest('hex');
  return `transaction_category_${hash}`;
};

const getCachedResult = async (cacheKey) => {
  try {
    const cached = await AICache.findOne({
      where: {
        cache_key: cacheKey,
        expires_at: {
          [require('sequelize').Op.gt]: new Date()
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

const classifyMerchantWithAI = async (merchantName, description, allCategories, apiKey, model) => {
  if (!apiKey || !model || allCategories.length === 0) {
    return null;
  }

  try {
    const prompt = `What type of business or category is "${merchantName}"? Transaction: ${description}. Categories: ${allCategories.map(c => c.name).join(', ')}.`;
    
    const payload = {
      inputs: prompt,
      parameters: {
        candidate_labels: allCategories.map(c => c.name),
        multi_label: false
      }
    };

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    if (!response.data || !response.data.labels || !response.data.scores) {
      return null;
    }

    const topLabel = response.data.labels[0];
    const topScore = response.data.scores[0];

    if (!topLabel || !topScore || topScore < 0.25) {
      return null;
    }

    const matched = allCategories.find(c => 
      c.name.toLowerCase() === topLabel.toLowerCase() ||
      topLabel.toLowerCase().includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(topLabel.toLowerCase())
    );
    
    if (!matched) {
      return null;
    }

    return {
      categoryId: matched.id,
      categoryName: matched.name,
      type: matched.type,
      confidence: topScore,
      method: 'ai_merchant_recognition'
    };
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Invalid Hugging Face API key');
    }
  }
  return null;
};

const classifyWithHuggingFace = async (text, categories, apiKey, model) => {
  if (!apiKey || !model || categories.length === 0) {
    return null;
  }

  try {
    const payload = {
      inputs: text,
      parameters: {
        candidate_labels: categories.map(c => c.name),
        multi_label: false
      }
    };

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (!response.data || !response.data.labels || !response.data.scores) {
      return null;
    }

    const topLabel = response.data.labels[0];
    const topScore = response.data.scores[0];

    if (!topLabel || !topScore || topScore < 0.3) {
      return null;
    }

    const matched = categories.find(c => 
      c.name.toLowerCase() === topLabel.toLowerCase() ||
      topLabel.toLowerCase().includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(topLabel.toLowerCase())
    );
    
    if (!matched) {
      return null;
    }

    return {
      categoryId: matched.id,
      categoryName: matched.name,
      type: matched.type,
      confidence: topScore,
      model: `huggingface-${model}`
    };
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Invalid Hugging Face API key');
    }
  }
  return null;
};

const getCategoryKeywords = () => {
  return {
    'Гориво': ['lukoil', 'лукойл', 'omv', 'омв', 'shell', 'бензин', 'гориво', 'fuel', 'petrol', 'газ', 'газова', 'бензиностанция', 'автогара', 'автосервиз'],
    'Храна': ['храна', 'ресторант', 'кафе', 'супермаркет', 'лидл', 'lidl', 'кауфланд', 'kaufland', 'била', 'billa', 'магазин', 'хранителни', 'продукти', 'пица', 'pizza', 'бургер', 'burger', 'кафене', 'макдоналдс', 'mcdonalds', 'kfc', 'домино', 'domino', 'ресторант', 'restaurant', 'кафене', 'cafe', 'кафе', 'coffee'],
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
    'Инвестиции': ['инвестиция', 'акции', 'облигации', 'депозит', 'банка', 'investment', 'stocks', 'bonds', 'deposit', 'bank'],
    'Фрийланс': ['фрийланс', 'freelance', 'проект', 'клиент', 'project', 'client']
  };
};

const categorizeWithKeywords = async (description, amount) => {
  const textLower = description.toLowerCase().trim();
  const keywords = getCategoryKeywords();
  const categoryScores = [];

  for (const [categoryName, categoryKeywords] of Object.entries(keywords)) {
    let score = 0;
    for (const keyword of categoryKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (textLower === keywordLower) {
        score += 1.0;
      } else if (textLower.includes(keywordLower)) {
        score += 0.4;
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

  const cacheKey = generateCacheKey(text, 'transaction_category');
  const cached = await getCachedResult(cacheKey);
  
  if (cached) {
    return { success: true, result: cached, fromCache: true };
  }

  try {
    const allCategories = await FinancialCategory.findAll({ where: { is_active: true } });
    
    if (allCategories.length === 0) {
      return { success: false, error: 'No categories found in database' };
    }

    const extracted = extractMerchantName(description);
    const hfApiKey = options.hfApiKey || process.env.HF_TXN_API_KEY;
    const hfModel = options.hfModel || process.env.HF_TXN_MODEL || 'facebook/bart-large-mnli';

    if (extracted && extracted.merchantName && hfApiKey) {
      try {
        const merchantResult = await classifyMerchantWithAI(
          extracted.merchantName,
          description,
          allCategories.map(c => ({ id: c.id, name: c.name, type: c.type })),
          hfApiKey,
          hfModel
        );

        if (merchantResult && merchantResult.categoryId) {
          await setCachedResult(cacheKey, merchantResult);
          return { success: true, result: merchantResult, fromCache: false };
        }
      } catch (error) {
      }
    }

    const transactionType = determineTransactionType(amount, description);
    const typeCategories = allCategories.filter(c => c.type === transactionType);

    let mlResult = null;
    if (hfApiKey && typeCategories.length > 0) {
      try {
        mlResult = await classifyWithHuggingFace(
          description,
          typeCategories.map(c => ({ id: c.id, name: c.name, type: c.type })),
          hfApiKey,
          hfModel
        );
      } catch (error) {
      }
    }

    if (mlResult && mlResult.categoryId) {
      await setCachedResult(cacheKey, mlResult);
      return { success: true, result: mlResult, fromCache: false };
    }

    const categoryName = await categorizeWithKeywords(description, amount);

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
      where: { name: categoryName, type: transactionType, is_active: true }
    });

    if (!category) {
      category = await FinancialCategory.create({
        name: categoryName,
        type: transactionType,
        icon: null,
        color: null,
        is_active: true
      });
    }

    const result = { categoryId: category.id, categoryName: category.name, type: transactionType };
    await setCachedResult(cacheKey, result);
    return { success: true, result, fromCache: false };

  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  categorizeTransaction
};

