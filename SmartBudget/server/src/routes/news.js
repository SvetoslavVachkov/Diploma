const express = require('express');
const router = express.Router();
const {
  getArticles,
  getArticleById,
  getSources,
  fetchSource,
  fetchAllSources,
  getFetchLogs
} = require('../controllers/newsController');

router.get('/articles', getArticles);
router.get('/articles/:id', getArticleById);
router.get('/sources', getSources);
router.post('/sources/:id/fetch', fetchSource);
router.post('/sources/fetch-all', fetchAllSources);
router.get('/fetch-logs', getFetchLogs);

module.exports = router;

