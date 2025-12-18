const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getForYouFeed,
  getRecommended,
  markArticleRead,
  updateInterests,
  getInterests
} = require('../controllers/personalizationController');

router.get('/for-you', authenticateToken, getForYouFeed);
router.get('/articles/:id/recommended', authenticateToken, getRecommended);
router.post('/articles/read', authenticateToken, markArticleRead);
router.put('/interests', authenticateToken, updateInterests);
router.get('/interests', authenticateToken, getInterests);

module.exports = router;

