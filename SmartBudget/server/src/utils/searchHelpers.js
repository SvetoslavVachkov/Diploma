const parseDateRange = (dateFrom, dateTo) => {
  const range = {};
  
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) {
      range.from = from;
    }
  }
  
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to.getTime())) {
      range.to = to;
      range.to.setHours(23, 59, 59, 999);
    }
  }
  
  return range;
};

const buildSortOrder = (sortBy, sortOrder) => {
  const validSortFields = ['published_at', 'created_at', 'fetched_at', 'view_count', 'title'];
  const validOrders = ['ASC', 'DESC'];
  
  const field = validSortFields.includes(sortBy) ? sortBy : 'published_at';
  const order = validOrders.includes(sortOrder?.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  return { field, order };
};

const sanitizeKeyword = (keyword) => {
  if (!keyword || typeof keyword !== 'string') {
    return null;
  }
  
  return keyword.trim().replace(/[%_]/g, '\\$&');
};

const validateFilters = (filters) => {
  const validated = {};
  
  if (filters.source_id) {
    const sourceId = filters.source_id.trim();
    if (sourceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      validated.source_id = sourceId;
    }
  }
  
  if (filters.category_id) {
    const categoryId = filters.category_id.trim();
    if (categoryId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      validated.category_id = categoryId;
    }
  }
  
  if (filters.sentiment) {
    const validSentiments = ['positive', 'negative', 'neutral'];
    if (validSentiments.includes(filters.sentiment.toLowerCase())) {
      validated.sentiment = filters.sentiment.toLowerCase();
    }
  }
  
  if (filters.language) {
    const lang = filters.language.trim().toLowerCase();
    if (lang.length === 2) {
      validated.language = lang;
    }
  }
  
  if (filters.keyword) {
    const sanitized = sanitizeKeyword(filters.keyword);
    if (sanitized && sanitized.length >= 2) {
      validated.keyword = sanitized;
    }
  }
  
  if (filters.date_from || filters.date_to) {
    const dateRange = parseDateRange(filters.date_from, filters.date_to);
    if (dateRange.from) validated.date_from = dateRange.from;
    if (dateRange.to) validated.date_to = dateRange.to;
  }
  
  if (filters.is_processed !== undefined) {
    validated.is_processed = filters.is_processed === 'true' || filters.is_processed === true;
  }
  
  if (filters.min_confidence) {
    const confidence = parseFloat(filters.min_confidence);
    if (!isNaN(confidence) && confidence >= 0 && confidence <= 1) {
      validated.min_confidence = confidence;
    }
  }
  
  return validated;
};

module.exports = {
  parseDateRange,
  buildSortOrder,
  sanitizeKeyword,
  validateFilters
};

