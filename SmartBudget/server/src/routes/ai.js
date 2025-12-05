const express = require('express');
const router = express.Router();
const {
  processArticleById,
  processBatch,
  getArticleAnalysis,
  classifyText,
  analyzeTextSentiment,
  summarizeText
} = require('../controllers/aiController');

router.post('/articles/:id/process', processArticleById);
router.post('/articles/process-batch', processBatch);
router.get('/articles/:id/analysis', getArticleAnalysis);
router.post('/classify', classifyText);
router.post('/sentiment', analyzeTextSentiment);
router.post('/summarize', summarizeText);

module.exports = router;

