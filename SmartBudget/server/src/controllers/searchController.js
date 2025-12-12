const { searchArticles, getSearchSuggestions, getFilterOptions } = require('../services/searchService');

const { validateFilters } = require('../utils/searchHelpers');

const search = async (req, res) => {
  try {
    const rawFilters = {
      keyword: req.query.q || req.query.keyword,
      source_id: req.query.source_id,
      source_ids: req.query.source_ids ? req.query.source_ids.split(',') : undefined,
      category_id: req.query.category_id,
      category_ids: req.query.category_ids ? req.query.category_ids.split(',') : undefined,
      sentiment: req.query.sentiment,
      date_from: req.query.date_from || req.query.from_date,
      date_to: req.query.date_to || req.query.to_date,
      language: req.query.language,
      is_processed: req.query.is_processed,
      min_confidence: req.query.min_confidence
    };

    const filters = validateFilters(rawFilters);

    const pagination = {
      page: req.query.page,
      limit: req.query.limit,
      sortBy: req.query.sort_by || req.query.sortBy,
      sortOrder: req.query.sort_order || req.query.sortOrder
    };

    const result = await searchArticles(filters, pagination);

    res.status(200).json({
      status: 'success',
      data: result.articles,
      pagination: result.pagination,
      filters: result.filters
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Search failed',
      error: error.message
    });
  }
};

const suggestions = async (req, res) => {
  try {
    const query = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    if (!query || query.length < 2) {
      return res.status(200).json({
        status: 'success',
        data: {
          keywords: [],
          categories: [],
          sources: []
        }
      });
    }

    const result = await getSearchSuggestions(query, limit);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get suggestions',
      error: error.message
    });
  }
};

const filterOptions = async (req, res) => {
  try {
    const options = await getFilterOptions();

    res.status(200).json({
      status: 'success',
      data: options
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get filter options',
      error: error.message
    });
  }
};

module.exports = {
  search,
  suggestions,
  filterOptions
};

