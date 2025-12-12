const { NewsSource, NewsArticle, FetchLog, AIAnalysis } = require('../models');
const { fetchArticlesFromSource, fetchAllActiveSources } = require('../services/newsFetcher');
const { Op } = require('sequelize');

const getArticles = async (req, res) => {
  try {
    const { searchArticles } = require('../services/searchService');
    
    const filters = {
      keyword: req.query.search || req.query.keyword,
      source_id: req.query.source_id,
      category_id: req.query.category_id,
      sentiment: req.query.sentiment,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      language: req.query.language,
      is_processed: req.query.is_processed
    };

    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === '') {
        delete filters[key];
      }
    });

    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
      sortBy: req.query.sort_by || 'published_at',
      sortOrder: req.query.sort_order || 'DESC'
    };

    const result = await searchArticles(filters, pagination);

    res.status(200).json({
      status: 'success',
      data: result.articles,
      pagination: result.pagination
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

    const analyses = await AIAnalysis.findAll({
      where: { article_id: article.id },
      order: [['created_at', 'DESC']]
    });

    const articleData = article.toJSON();
    articleData.ai_analyses = {
      classification: analyses.find(a => a.analysis_type === 'classification'),
      sentiment: analyses.find(a => a.analysis_type === 'sentiment'),
      summary: analyses.find(a => a.analysis_type === 'summary')
    };

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

const getSources = async (req, res) => {
  try {
    const sources = await NewsSource.findAll({
      where: req.query.active_only === 'true' ? { is_active: true } : {},
      order: [['name', 'ASC']],
      include: [{
        model: NewsArticle,
        as: 'articles',
        attributes: ['id'],
        separate: true
      }]
    });

    const sourcesWithCounts = sources.map(source => ({
      ...source.toJSON(),
      article_count: source.articles ? source.articles.length : 0
    }));

    res.status(200).json({
      status: 'success',
      count: sourcesWithCounts.length,
      data: sourcesWithCounts
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch sources',
      error: error.message
    });
  }
};

const fetchSource = async (req, res) => {
  try {
    const sourceId = req.params.id;
    const result = await fetchArticlesFromSource(sourceId);

    res.status(result.success ? 200 : 500).json({
      status: result.success ? 'success' : 'error',
      message: result.message,
      articlesFetched: result.articlesFetched,
      duration: result.duration
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch articles',
      error: error.message
    });
  }
};

const fetchAllSources = async (req, res) => {
  try {
    const results = await fetchAllActiveSources();

    const totalArticles = results.reduce((sum, r) => sum + r.articlesFetched, 0);
    const successCount = results.filter(r => r.success).length;

    res.status(200).json({
      status: 'success',
      message: `Fetched ${totalArticles} articles from ${successCount}/${results.length} sources`,
      results,
      summary: {
        totalSources: results.length,
        successful: successCount,
        totalArticlesFetched: totalArticles
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch from all sources',
      error: error.message
    });
  }
};

const getFetchLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const where = {};

    if (req.query.source_id) {
      where.source_id = req.query.source_id;
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.from_date) {
      where.fetched_at = {
        [Op.gte]: new Date(req.query.from_date)
      };
    }

    const { count, rows } = await FetchLog.findAndCountAll({
      where,
      include: [{
        model: NewsSource,
        as: 'source',
        attributes: ['id', 'name']
      }],
      order: [['fetched_at', 'DESC']],
      limit,
      offset
    });

    res.status(200).json({
      status: 'success',
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
};

module.exports = {
  getArticles,
  getArticleById,
  getSources,
  fetchSource,
  fetchAllSources,
  getFetchLogs
};

