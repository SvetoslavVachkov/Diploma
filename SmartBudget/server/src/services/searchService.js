const { NewsArticle, NewsSource, ArticleCategory, NewsCategory, AIAnalysis } = require('../models');
const { Op } = require('sequelize');
const { validateFilters, buildSortOrder } = require('../utils/searchHelpers');

const buildSearchQuery = (filters) => {
  const where = {};
  const include = [];
  const having = {};

  if (filters.keyword) {
    const keyword = filters.keyword.trim();
    where[Op.or] = [
      { title: { [Op.like]: `%${keyword}%` } },
      { excerpt: { [Op.like]: `%${keyword}%` } },
      { content: { [Op.like]: `%${keyword}%` } }
    ];
  }

  if (filters.source_id) {
    where.source_id = filters.source_id;
  }

  if (filters.source_ids && Array.isArray(filters.source_ids)) {
    where.source_id = { [Op.in]: filters.source_ids };
  }

  if (filters.category_id) {
    include.push({
      model: ArticleCategory,
      as: 'categories',
      where: { category_id: filters.category_id },
      required: true,
      attributes: []
    });
  }

  if (filters.category_ids && Array.isArray(filters.category_ids)) {
    include.push({
      model: ArticleCategory,
      as: 'categories',
      where: { category_id: { [Op.in]: filters.category_ids } },
      required: true,
      attributes: []
    });
  }

  if (filters.sentiment) {
    const sentimentFilter = {
      model: AIAnalysis,
      as: 'aiAnalyses',
      where: {
        analysis_type: 'sentiment',
        result: {
          [Op.like]: `%"sentiment":"${filters.sentiment}"%`
        }
      },
      required: true,
      attributes: []
    };
    include.push(sentimentFilter);
  }

  if (filters.date_from || filters.date_to) {
    where.published_at = {};
    if (filters.date_from) {
      where.published_at[Op.gte] = new Date(filters.date_from);
    }
    if (filters.date_to) {
      where.published_at[Op.lte] = new Date(filters.date_to);
    }
  }

  if (filters.language) {
    where.language = filters.language;
  }

  if (filters.is_processed !== undefined) {
    where.is_processed = filters.is_processed === 'true' || filters.is_processed === true;
  }

  if (filters.min_confidence) {
    include.push({
      model: ArticleCategory,
      as: 'categories',
      where: {
        confidence_score: { [Op.gte]: parseFloat(filters.min_confidence) }
      },
      required: false,
      attributes: []
    });
  }

  return { where, include, having };
};

const searchArticles = async (filters = {}, pagination = {}) => {
  const validatedFilters = validateFilters(filters);
  const page = parseInt(pagination.page) || 1;
  const limit = Math.min(parseInt(pagination.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const { field: sortBy, order: sortOrder } = buildSortOrder(pagination.sortBy, pagination.sortOrder);

  const { where, include } = buildSearchQuery(validatedFilters);

  const baseInclude = [
    {
      model: NewsSource,
      as: 'source',
      attributes: ['id', 'name', 'logo_url', 'url']
    }
  ];

  const allIncludes = [...baseInclude, ...include];

  const order = [[sortBy, sortOrder]];

  if (filters.keyword && sortBy === 'published_at') {
    order.unshift([Op.literal('CASE WHEN title LIKE \'%' + filters.keyword + '%\' THEN 1 ELSE 2 END')]);
  }

  const { count, rows } = await NewsArticle.findAndCountAll({
    where,
    include: allIncludes,
    distinct: true,
    order,
    limit,
    offset
  });

  const articlesWithDetails = await Promise.all(
    rows.map(async (article) => {
      const articleData = article.toJSON();

      const categories = await ArticleCategory.findAll({
        where: { article_id: article.id },
        include: [{
          model: NewsCategory,
          as: 'category',
          attributes: ['id', 'name', 'slug', 'color', 'icon']
        }]
      });

      const sentimentAnalysis = await AIAnalysis.findOne({
        where: {
          article_id: article.id,
          analysis_type: 'sentiment'
        },
        order: [['created_at', 'DESC']]
      });

      articleData.categories = categories.map(ac => ({
        id: ac.category.id,
        name: ac.category.name,
        slug: ac.category.slug,
        color: ac.category.color,
        icon: ac.category.icon,
        confidence: ac.confidence_score
      }));

      if (sentimentAnalysis) {
        articleData.sentiment = sentimentAnalysis.result;
      }

      return articleData;
    })
  );

  return {
    articles: articlesWithDetails,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit)
    },
    filters: {
      applied: Object.keys(filters).length,
      ...filters
    }
  };
};

const getSearchSuggestions = async (query, limit = 10) => {
  if (!query || query.length < 2) {
    return { keywords: [], categories: [], sources: [] };
  }

  const searchTerm = query.trim().toLowerCase();

  const keywordSuggestions = await NewsArticle.findAll({
    attributes: ['title'],
    where: {
      [Op.or]: [
        { title: { [Op.like]: `%${searchTerm}%` } },
        { excerpt: { [Op.like]: `%${searchTerm}%` } }
      ]
    },
    limit: limit * 2,
    order: [['published_at', 'DESC']],
    raw: true
  });

  const keywords = [...new Set(
    keywordSuggestions
      .flatMap(a => {
        const words = a.title.split(/\s+/);
        return words.filter(w => 
          w.length > 3 && 
          w.toLowerCase().includes(searchTerm) &&
          !/^[0-9]+$/.test(w)
        );
      })
      .slice(0, limit)
  )];

  const categorySuggestions = await NewsCategory.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.like]: `%${searchTerm}%` } },
        { slug: { [Op.like]: `%${searchTerm}%` } }
      ],
      is_active: true
    },
    attributes: ['id', 'name', 'slug'],
    limit
  });

  const sourceSuggestions = await NewsSource.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.like]: `%${searchTerm}%` } }
      ],
      is_active: true
    },
    attributes: ['id', 'name'],
    limit
  });

  return {
    keywords: keywords.slice(0, limit),
    categories: categorySuggestions.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug
    })),
    sources: sourceSuggestions.map(s => ({
      id: s.id,
      name: s.name
    }))
  };
};

const getFilterOptions = async () => {
  const [categories, sources, sentimentStats] = await Promise.all([
    NewsCategory.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'slug', 'color', 'icon'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    }),
    NewsSource.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'logo_url'],
      order: [['name', 'ASC']]
    }),
    AIAnalysis.findAll({
      where: { analysis_type: 'sentiment' },
      attributes: ['result'],
      limit: 1000,
      raw: true
    })
  ]);

  const sentimentCounts = {
    positive: 0,
    negative: 0,
    neutral: 0
  };

  sentimentStats.forEach(analysis => {
    try {
      const result = typeof analysis.result === 'string' 
        ? JSON.parse(analysis.result) 
        : analysis.result;
      if (result && result.sentiment) {
        sentimentCounts[result.sentiment] = (sentimentCounts[result.sentiment] || 0) + 1;
      }
    } catch (e) {
    }
  });

  return {
    categories: categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      icon: c.icon
    })),
    sources: sources.map(s => ({
      id: s.id,
      name: s.name,
      logo_url: s.logo_url
    })),
    sentiments: Object.keys(sentimentCounts).map(sentiment => ({
      value: sentiment,
      count: sentimentCounts[sentiment]
    })),
    dateRange: {
      min: await NewsArticle.min('published_at'),
      max: await NewsArticle.max('published_at')
    }
  };
};

module.exports = {
  searchArticles,
  getSearchSuggestions,
  getFilterOptions,
  buildSearchQuery
};

