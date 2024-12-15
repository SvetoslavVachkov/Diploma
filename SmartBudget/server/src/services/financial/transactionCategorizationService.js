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

const classifyWithHuggingFace = async (text, categories, apiKey, model) => {
  if (!apiKey || !model || categories.length === 0) {
    return null;
  }

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
        Authorization: `Bearer ${apiKey}`
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

  const matched = categories.find(c => c.name.toLowerCase() === topLabel.toLowerCase());
  if (!matched) {
    return null;
  }

  return {
    categoryId: matched.id,
    categoryName: matched.name,
    type: matched.type,
    confidence: topScore
  };
};

const getCategoryKeywords = () => {
  return {
    'Храна': ['храна', 'ресторант', 'кафе', 'супермаркет', 'лидл', 'кауфланд', 'била', 'магазин', 'хранителни', 'продукти', 'пица', 'бургер', 'кафене'],
    'Транспорт': ['транспорт', 'бензин', 'гориво', 'fuel', 'lukoil', 'лукойл', 'омв', 'omv', 'shell', 'автобус', 'метро', 'такси', 'uber', 'bolt', 'паркинг', 'автомобил', 'кола'],
    'Наем': ['наем', 'наема', 'квартира', 'жилище', 'ипотека'],
    'Комунални': ['комунални', 'ток', 'електричество', 'вода', 'телефон', 'интернет', 'телеком', 'виваком', 'а1', 'теленор', 'електроснабдяване'],
    'Забавление': ['забавление', 'кино', 'театър', 'концерт', 'клуб', 'бар', 'алкохол', 'билет', 'игра', 'игри'],
    'Здраве': ['здраве', 'лекар', 'аптека', 'болница', 'лекарство', 'стоматолог', 'лечение', 'медицина', 'фармация'],
    'Образование': ['образование', 'училище', 'университет', 'курс', 'обучение', 'книга', 'учебник'],
    'Обувки и дрехи': ['дрехи', 'обувки', 'мода', 'ризи', 'панталони', 'облекло', 'обувка'],
    'Техника': ['техника', 'компютър', 'телефон', 'таблет', 'телевизор', 'електроника', 'софтуер', 'хардуер'],
    'Заплата': ['заплата', 'заплатa', 'заплат', 'зарплата', 'зарплатa', 'зарплат'],
    'Бонуси': ['бонус', 'премия', 'награда'],
    'Инвестиции': ['инвестиция', 'акции', 'облигации', 'депозит', 'банка'],
    'Фрийланс': ['фрийланс', 'freelance', 'проект', 'клиент']
  };
};

const categorizeWithKeywords = async (description, amount) => {
  const textLower = description.toLowerCase();
  const keywords = getCategoryKeywords();
  const categoryScores = [];

  for (const [categoryName, categoryKeywords] of Object.entries(keywords)) {
    let score = 0;
    for (const keyword of categoryKeywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        score += 0.3;
      }
    }
    if (score > 0) {
      categoryScores.push({ categoryName, score });
    }
  }

  categoryScores.sort((a, b) => b.score - a.score);

  if (categoryScores.length > 0 && categoryScores[0].score >= 0.3) {
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
    const transactionType = determineTransactionType(amount, description);
    const categories = await FinancialCategory.findAll({ where: { type: transactionType, is_active: true } });

    const hfApiKey = options.hfApiKey || process.env.HF_TXN_API_KEY;
    const hfModel = options.hfModel || process.env.HF_TXN_MODEL || 'facebook/bart-large-mnli';

    let mlResult = null;
    if (hfApiKey) {
      mlResult = await classifyWithHuggingFace(
        description,
        categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
        hfApiKey,
        hfModel
      );
    }

    if (mlResult && mlResult.categoryId) {
      await setCachedResult(cacheKey, mlResult);
      return { success: true, result: mlResult, fromCache: false };
    }

    const categoryName = await categorizeWithKeywords(description, amount);

    if (!categoryName) {
      const defaultCategory = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
      const category = await FinancialCategory.findOne({
        where: { name: defaultCategory, type: transactionType, is_active: true }
      });
      
      if (category) {
        const result = { categoryId: category.id, categoryName: category.name, type: transactionType };
        await setCachedResult(cacheKey, result);
        return { success: true, result, fromCache: false };
      }
      return { success: false, error: 'Default category not found' };
    }

    const category = await FinancialCategory.findOne({
      where: { name: categoryName, type: transactionType, is_active: true }
    });

    if (!category) {
      const defaultCategory = transactionType === 'income' ? 'Други приходи' : 'Други разходи';
      const fallbackCategory = await FinancialCategory.findOne({
        where: { name: defaultCategory, type: transactionType, is_active: true }
      });
      
      if (fallbackCategory) {
        const result = { categoryId: fallbackCategory.id, categoryName: fallbackCategory.name, type: transactionType };
        await setCachedResult(cacheKey, result);
        return { success: true, result, fromCache: false };
      }
      return { success: false, error: 'Category not found' };
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

