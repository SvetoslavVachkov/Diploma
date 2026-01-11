const { NewsSource, NewsArticle, FetchLog, AIAnalysis } = require('../models');
const { Op } = require('sequelize');
const { scoreImportance } = require('../services/ai/importanceService');

const getArticles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.source_id) {
      where.source_id = req.query.source_id;
    }
    if (req.query.date_from) {
      where.published_at = { [Op.gte]: new Date(req.query.date_from) };
    }
    if (req.query.date_to) {
      where.published_at = { ...where.published_at, [Op.lte]: new Date(req.query.date_to) };
    }

    const { count, rows } = await NewsArticle.findAndCountAll({
      where,
      include: [{
        model: NewsSource,
        as: 'source',
        attributes: ['id', 'name', 'logo_url', 'url']
      }],
      order: [['published_at', 'DESC']],
      limit: limit * 3,
      offset,
      distinct: true
    });

    const apiKey = process.env.HF_NEWS_API_KEY;
    const model = process.env.HF_NEWS_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';

    if (!apiKey) {
      const seenTitles = new Set();
      const allArticles = [];
      for (const article of rows) {
        const articleData = article.toJSON();
        const titleKey = articleData.title?.toLowerCase().trim().substring(0, 100);
        if (titleKey && seenTitles.has(titleKey)) {
          continue;
        }
        seenTitles.add(titleKey);
        allArticles.push(articleData);
      }
      return res.status(200).json({
        status: 'success',
        data: allArticles,
        pagination: {
          page,
          limit,
          total: allArticles.length,
          pages: Math.ceil(allArticles.length / limit)
        },
        message: 'AI not configured - showing all articles. Add HF_NEWS_API_KEY to filter by importance.'
      });
    }

    const seenTitles = new Set();
    const importantArticles = [];
    
    for (const article of rows) {
      const articleData = article.toJSON();
      const titleKey = articleData.title?.toLowerCase().trim().substring(0, 100);
      
      if (titleKey && seenTitles.has(titleKey)) {
        continue;
      }
      seenTitles.add(titleKey);
      
      try {
        const importance = await scoreImportance(
          article.title,
          article.content,
          article.excerpt,
          apiKey,
          model
        );
        if (importance.score >= 40 || importance.important) {
          articleData.importance = importance;
          importantArticles.push(articleData);
        }
      } catch (error) {
        articleData.importance = { important: true, score: 50, reason: 'AI error - showing article' };
        importantArticles.push(articleData);
      }
    }

    if (importantArticles.length === 0 && rows.length > 0) {
      const seenTitles = new Set();
      const allArticles = [];
      for (const article of rows) {
        const articleData = article.toJSON();
        const titleKey = articleData.title?.toLowerCase().trim().substring(0, 100);
        if (titleKey && seenTitles.has(titleKey)) {
          continue;
        }
        seenTitles.add(titleKey);
        articleData.importance = { important: true, score: 50, reason: 'No AI filter - showing all' };
        allArticles.push(articleData);
      }
      return res.status(200).json({
        status: 'success',
        data: allArticles,
        pagination: {
          page,
          limit,
          total: allArticles.length,
          pages: Math.ceil(allArticles.length / limit)
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: importantArticles,
      pagination: {
        page,
        limit,
        total: importantArticles.length,
        pages: Math.ceil(importantArticles.length / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch articles',
      error: error.message
    });
  }
};

const getArticleById = async (req, res) => {
  try {
    const article = await NewsArticle.findByPk(req.params.id, {
      include: [{
        model: NewsSource,
        as: 'source',
        attributes: ['id', 'name', 'logo_url', 'url']
      }]
    });

    if (!article) {
      return res.status(404).json({
        status: 'error',
        message: 'Article not found'
      });
    }

    await article.increment('view_count');

    const articleData = article.toJSON();
    const apiKey = process.env.HF_NEWS_API_KEY;
    const model = process.env.HF_NEWS_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
    const importance = await scoreImportance(
      article.title,
      article.content,
      article.excerpt,
      apiKey,
      model
    );
    articleData.importance = importance;

    res.status(200).json({
      status: 'success',
      data: articleData
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch article',
      error: error.message
    });
  }
};

module.exports = {
  getArticles,
  getArticleById
};

