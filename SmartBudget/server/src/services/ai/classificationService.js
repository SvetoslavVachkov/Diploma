const axios = require('axios');
const crypto = require('crypto');
const { AICache, NewsCategory, ArticleCategory } = require('../../models');

const UCLASSIFY_API_URL = 'https://api.uclassify.com/v1';
const CACHE_HOURS = 24;

const generateCacheKey = (text, type) => {
  const hash = crypto.createHash('sha256').update(`${type}:${text}`).digest('hex');
  return `ai_classification_${hash}`;
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
    console.error('Cache lookup error:', error.message);
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
    console.error('Cache store error:', error.message);
  }
};

const classifyWithUClassify = async (text, apiKey) => {
  try {
    const response = await axios.post(
      `${UCLASSIFY_API_URL}/uClassify/Topics/classify`,
      { texts: [text] },
      {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data[0] && response.data[0].classification) {
      const classifications = response.data[0].classification;
      const sorted = Object.entries(classifications)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      return {
        categories: sorted.map(([name, score]) => ({ name, score })),
        confidence: sorted[0] ? sorted[0][1] : 0
      };
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Invalid uClassify API key');
    }
    throw error;
  }
  return null;
};

const classifyWithKeywords = async (text, availableCategories) => {
  const textLower = text.toLowerCase();
  const categoryScores = [];

  for (const category of availableCategories) {
    let score = 0;
    const categoryNameLower = category.name.toLowerCase();
    const categorySlugLower = category.slug.toLowerCase();

    if (textLower.includes(categoryNameLower) || textLower.includes(categorySlugLower)) {
      score += 0.5;
    }

    const keywords = getCategoryKeywords(category.slug);
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        score += 0.2;
      }
    }

    if (score > 0) {
      categoryScores.push({ category, score });
    }
  }

  categoryScores.sort((a, b) => b.score - a.score);

  if (categoryScores.length > 0) {
    const maxScore = categoryScores[0].score;
    const normalized = categoryScores
      .filter(c => c.score >= maxScore * 0.5)
      .slice(0, 3)
      .map(c => ({
        name: c.category.name,
        slug: c.category.slug,
        score: Math.min(c.score, 1.0)
      }));

    return {
      categories: normalized,
      confidence: maxScore
    };
  }

  return null;
};

const getCategoryKeywords = (slug) => {
  const keywordMap = {
    'technology': ['технология', 'технологии', 'tech', 'компютър', 'софтуер', 'интернет', 'ai', 'изкуствен интелект'],
    'politics': ['политика', 'политически', 'правителство', 'партия', 'избори', 'държава'],
    'economy': ['икономика', 'икономически', 'финанси', 'пазар', 'бизнес', 'банка', 'валута'],
    'sports': ['спорт', 'спортен', 'футбол', 'баскетбол', 'олимпиада', 'състезание'],
    'health': ['здраве', 'здравословен', 'лекар', 'болница', 'лечение', 'медицина'],
    'education': ['образование', 'училище', 'университет', 'студент', 'обучение'],
    'culture': ['култура', 'културен', 'изкуство', 'музей', 'театър', 'кино'],
    'world': ['свет', 'световен', 'международен', 'глобално', 'държави'],
    'local': ['локален', 'град', 'община', 'регион', 'българия', 'български']
  };

  return keywordMap[slug] || [];
};

const classifyArticle = async (article, options = {}) => {
  const startTime = Date.now();
  const text = `${article.title} ${article.excerpt || ''} ${article.content || ''}`.trim();
  
  if (!text || text.length < 10) {
    return { success: false, error: 'Article text too short' };
  }

  const cacheKey = generateCacheKey(text, 'classification');
  const cached = await getCachedResult(cacheKey);
  
  if (cached) {
    return { success: true, result: cached, fromCache: true };
  }

  try {
    const categories = await NewsCategory.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC']]
    });

    let classificationResult = null;

    if (options.uclassifyApiKey) {
      try {
        classificationResult = await classifyWithUClassify(text, options.uclassifyApiKey);
      } catch (error) {
        console.error('uClassify classification failed, falling back to keyword matching:', error.message);
      }
    }

    if (!classificationResult) {
      classificationResult = await classifyWithKeywords(text, categories);
    }

    if (!classificationResult || classificationResult.categories.length === 0) {
      return { success: false, error: 'Could not classify article' };
    }

    const result = {
      categories: classificationResult.categories,
      confidence: classificationResult.confidence || 0.5,
      model: options.uclassifyApiKey ? 'uclassify' : 'keyword-matching'
    };

    await setCachedResult(cacheKey, result);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      result,
      processingTime,
      fromCache: false
    };

  } catch (error) {
    console.error('Classification error:', error.message);
    return { success: false, error: error.message };
  }
};

const assignCategoriesToArticle = async (articleId, classificationResult) => {
  try {
    const categories = await NewsCategory.findAll({
      where: { is_active: true }
    });

    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase(), cat.id);
      categoryMap.set(cat.slug.toLowerCase(), cat.id);
    });

    const assignments = [];

    for (const catData of classificationResult.categories) {
      const categoryId = categoryMap.get(catData.name.toLowerCase()) || 
                        categoryMap.get(catData.slug?.toLowerCase());

      if (categoryId && catData.score >= 0.3) {
        try {
          await ArticleCategory.upsert({
            article_id: articleId,
            category_id: categoryId,
            confidence_score: Math.min(catData.score, 1.0)
          });
          assignments.push({ categoryId, score: catData.score });
        } catch (error) {
          if (error.name !== 'SequelizeUniqueConstraintError') {
            console.error(`Error assigning category:`, error.message);
          }
        }
      }
    }

    return assignments;
  } catch (error) {
    console.error('Error assigning categories:', error.message);
    return [];
  }
};

module.exports = {
  classifyArticle,
  assignCategoriesToArticle
};

