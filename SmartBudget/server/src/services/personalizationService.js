const { NewsArticle, UserInterest, UserReadingHistory, ArticleCategory, NewsCategory, AIAnalysis } = require('../models');
const { Op } = require('sequelize');

const getUserInterests = async (userId) => {
  try {
    const interests = await UserInterest.findAll({
      where: { user_id: userId },
      include: [{
        model: NewsCategory,
        as: 'category',
        attributes: ['id', 'name', 'slug']
      }],
      order: [['weight', 'DESC']]
    });

    return interests.map(i => ({
      categoryId: i.category_id,
      categoryName: i.category.name,
      weight: parseFloat(i.weight)
    }));
  } catch (error) {
    return [];
  }
};

const updateUserInterest = async (userId, categoryId, weightDelta) => {
  try {
    const [interest, created] = await UserInterest.findOrCreate({
      where: {
        user_id: userId,
        category_id: categoryId
      },
      defaults: {
        user_id: userId,
        category_id: categoryId,
        weight: 1.0
      }
    });

    const newWeight = Math.min(Math.max(parseFloat(interest.weight) + weightDelta, 0.1), 5.0);
    await interest.update({ weight: newWeight });

    return { success: true, weight: newWeight };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const recordArticleRead = async (userId, articleId, timeSpent = null, scrollPercentage = null) => {
  try {
    await UserReadingHistory.upsert({
      user_id: userId,
      article_id: articleId,
      read_at: new Date(),
      time_spent_seconds: timeSpent,
      scroll_percentage: scrollPercentage
    });

    const article = await NewsArticle.findByPk(articleId, {
      include: [{
        model: ArticleCategory,
        as: 'categories',
        include: [{
          model: NewsCategory,
          as: 'category'
        }]
      }]
    });

    if (article && article.categories) {
      for (const articleCategory of article.categories) {
        await updateUserInterest(userId, articleCategory.category_id, 0.1);
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getPersonalizedFeed = async (userId, options = {}) => {
  try {
    const page = parseInt(options.page) || 1;
    const limit = Math.min(parseInt(options.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const interests = await getUserInterests(userId);
    const readArticleIds = await UserReadingHistory.findAll({
      where: { user_id: userId },
      attributes: ['article_id']
    }).then(records => records.map(r => r.article_id));

    const where = {};

    if (readArticleIds.length > 0) {
      where.id = {
        [Op.notIn]: readArticleIds
      };
    }

    let articles;

    if (interests.length > 0) {
      const categoryIds = interests.map(i => i.categoryId);
      const interestWeights = {};
      interests.forEach(i => {
        interestWeights[i.categoryId] = i.weight;
      });

      articles = await NewsArticle.findAll({
        where,
        include: [{
          model: ArticleCategory,
          as: 'categories',
          where: {
            category_id: {
              [Op.in]: categoryIds
            }
          },
          include: [{
            model: NewsCategory,
            as: 'category'
          }]
        }, {
          model: AIAnalysis,
          as: 'aiAnalyses',
          required: false,
          attributes: ['sentiment', 'summary']
        }],
        order: [
          [ArticleCategory, 'confidence_score', 'DESC'],
          ['published_at', 'DESC']
        ],
        limit,
        offset,
        distinct: true
      });

      articles = articles.map(article => {
        let relevanceScore = 0;
        if (article.categories && article.categories.length > 0) {
          article.categories.forEach(ac => {
            const weight = interestWeights[ac.category_id] || 0.5;
            const confidence = parseFloat(ac.confidence_score) || 0.5;
            relevanceScore += weight * confidence;
          });
        }
        article.relevanceScore = relevanceScore;
        return article;
      });

      articles.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else {
      articles = await NewsArticle.findAll({
        where,
        include: [{
          model: AIAnalysis,
          as: 'aiAnalyses',
          required: false,
          attributes: ['sentiment', 'summary']
        }],
        order: [['published_at', 'DESC']],
        limit,
        offset,
        distinct: true
      });
    }

    const total = await NewsArticle.count({
      where,
      distinct: true,
      col: 'id'
    });

    return {
      success: true,
      articles: articles.map(a => ({
        id: a.id,
        title: a.title,
        excerpt: a.excerpt,
        url: a.url,
        image_url: a.image_url,
        published_at: a.published_at,
        sentiment: a.aiAnalyses?.[0]?.sentiment || null,
        summary: a.aiAnalyses?.[0]?.summary || null,
        categories: a.categories?.map(c => ({
          id: c.category.id,
          name: c.category.name,
          slug: c.category.slug
        })) || []
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getRecommendedArticles = async (userId, articleId, limit = 5) => {
  try {
    const article = await NewsArticle.findByPk(articleId, {
      include: [{
        model: ArticleCategory,
        as: 'categories',
        include: [{
          model: NewsCategory,
          as: 'category'
        }]
      }]
    });

    if (!article) {
      return { success: false, error: 'Article not found' };
    }

    const categoryIds = article.categories.map(ac => ac.category_id);
    const readArticleIds = await UserReadingHistory.findAll({
      where: { user_id: userId },
      attributes: ['article_id']
    }).then(records => records.map(r => r.article_id));

    const recommended = await NewsArticle.findAll({
      where: {
        id: {
          [Op.ne]: articleId,
          [Op.notIn]: readArticleIds
        }
      },
      include: [{
        model: ArticleCategory,
        as: 'categories',
        where: {
          category_id: {
            [Op.in]: categoryIds
          }
        },
        include: [{
          model: NewsCategory,
          as: 'category'
        }]
      }],
      order: [
        [ArticleCategory, 'confidence_score', 'DESC'],
        ['published_at', 'DESC']
      ],
      limit,
      distinct: true
    });

    return {
      success: true,
      articles: recommended.map(a => ({
        id: a.id,
        title: a.title,
        excerpt: a.excerpt,
        url: a.url,
        image_url: a.image_url,
        published_at: a.published_at
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateUserPreferences = async (userId, categoryIds, action = 'add') => {
  try {
    if (action === 'add') {
      for (const categoryId of categoryIds) {
        await UserInterest.findOrCreate({
          where: {
            user_id: userId,
            category_id: categoryId
          },
          defaults: {
            user_id: userId,
            category_id: categoryId,
            weight: 2.0
          }
        });
      }
    } else if (action === 'remove') {
      await UserInterest.destroy({
        where: {
          user_id: userId,
          category_id: {
            [Op.in]: categoryIds
          }
        }
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  getUserInterests,
  updateUserInterest,
  recordArticleRead,
  getPersonalizedFeed,
  getRecommendedArticles,
  updateUserPreferences
};

