const express = require('express');
const router = express.Router();
const {
  getArticles,
  getArticleById
} = require('../controllers/newsController');

router.get('/articles', getArticles);
router.get('/articles/:id', getArticleById);

module.exports = router;

