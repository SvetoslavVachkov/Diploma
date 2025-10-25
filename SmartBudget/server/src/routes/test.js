const express = require('express');
const router = express.Router();
const {
  testConnection,
  getNewsCategories,
  getFinancialCategories
} = require('../controllers/testController');

router.get('/db', testConnection);
router.get('/categories/news', getNewsCategories);
router.get('/categories/financial', getFinancialCategories);

module.exports = router;
