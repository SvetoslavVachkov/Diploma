const express = require('express');
const router = express.Router();
const {
  getCategories,
  createTransactionHandler,
  updateTransactionHandler,
  deleteTransactionHandler,
  getTransactionsHandler,
  getTransactionByIdHandler,
  getTransactionSummaryHandler,
  createBudgetHandler,
  updateBudgetHandler,
  deleteBudgetHandler,
  getBudgetsHandler,
  getBudgetByIdHandler,
  getMonthlyReportHandler,
  getYearlyReportHandler,
  getCategoryBreakdownHandler,
  getTrendsHandler
} = require('../controllers/financialController');

router.get('/categories', getCategories);

router.post('/transactions', createTransactionHandler);
router.get('/transactions', getTransactionsHandler);
router.get('/transactions/summary', getTransactionSummaryHandler);
router.get('/transactions/:id', getTransactionByIdHandler);
router.put('/transactions/:id', updateTransactionHandler);
router.delete('/transactions/:id', deleteTransactionHandler);

router.post('/budgets', createBudgetHandler);
router.get('/budgets', getBudgetsHandler);
router.get('/budgets/:id', getBudgetByIdHandler);
router.put('/budgets/:id', updateBudgetHandler);
router.delete('/budgets/:id', deleteBudgetHandler);

router.get('/reports/monthly', getMonthlyReportHandler);
router.get('/reports/yearly', getYearlyReportHandler);
router.get('/reports/category-breakdown', getCategoryBreakdownHandler);
router.get('/reports/trends', getTrendsHandler);

module.exports = router;

