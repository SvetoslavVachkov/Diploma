const { NewsArticle } = require('../models');
const { Op } = require('sequelize');

const normalizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
};

const checkDuplicate = async (url, sourceId) => {
  const normalizedUrl = normalizeUrl(url);
  const urlPath = normalizedUrl.split('/').pop();
  
  const existing = await NewsArticle.findOne({
    where: {
      source_id: sourceId,
      [Op.or]: [
        { url: normalizedUrl },
        { url: { [Op.like]: `%${urlPath}%` } }
      ]
    },
    attributes: ['id']
  });

  return !!existing;
};

const checkDuplicatesBatch = async (urls, sourceId) => {
  if (urls.length === 0) return new Set();
  
  const normalizedUrls = urls.map(url => normalizeUrl(url));
  const urlMap = new Map();
  urls.forEach((url, index) => {
    urlMap.set(normalizedUrls[index], url);
  });
  
  const existingArticles = await NewsArticle.findAll({
    where: {
      source_id: sourceId
    },
    attributes: ['url'],
    limit: 5000
  });

  const existingUrls = new Set();
  existingArticles.forEach(article => {
    const normalized = normalizeUrl(article.url);
    existingUrls.add(normalized);
  });

  const duplicates = new Set();
  normalizedUrls.forEach((normalizedUrl) => {
    if (existingUrls.has(normalizedUrl)) {
      duplicates.add(urlMap.get(normalizedUrl));
    }
  });

  return duplicates;
};

module.exports = {
  normalizeUrl,
  checkDuplicate,
  checkDuplicatesBatch
};

