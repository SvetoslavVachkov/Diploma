const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
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
  getTrendsHandler,
  createGoalHandler,
  updateGoalHandler,
  deleteGoalHandler,
  getGoalsHandler,
  getGoalByIdHandler,
  addToGoalHandler,
  getGoalsSummaryHandler
} = require('../controllers/financialController');
const {
  importCSVHandler,
  getSpendingReportHandler,
  uploadCSV
} = require('../controllers/csvImportController');
const {
  scanReceiptHandler,
  uploadReceipt
} = require('../controllers/receiptController');

router.get('/categories', getCategories);

router.post('/transactions', authenticateToken, createTransactionHandler);
router.get('/transactions', authenticateToken, getTransactionsHandler);
router.get('/transactions/summary', authenticateToken, getTransactionSummaryHandler);
router.get('/transactions/:id', authenticateToken, getTransactionByIdHandler);
router.put('/transactions/:id', authenticateToken, updateTransactionHandler);
router.delete('/transactions/:id', authenticateToken, deleteTransactionHandler);

router.post('/transactions/import-csv', authenticateToken, uploadCSV, importCSVHandler);

router.post('/receipts/scan', authenticateToken, uploadReceipt, scanReceiptHandler);

router.post('/budgets', authenticateToken, createBudgetHandler);
router.get('/budgets', authenticateToken, getBudgetsHandler);
router.get('/budgets/:id', authenticateToken, getBudgetByIdHandler);
router.put('/budgets/:id', authenticateToken, updateBudgetHandler);
router.delete('/budgets/:id', authenticateToken, deleteBudgetHandler);

router.get('/reports/monthly', authenticateToken, getMonthlyReportHandler);
router.get('/reports/yearly', authenticateToken, getYearlyReportHandler);
router.get('/reports/category-breakdown', authenticateToken, getCategoryBreakdownHandler);
router.get('/reports/trends', authenticateToken, getTrendsHandler);
router.get('/reports/spending', authenticateToken, getSpendingReportHandler);

router.post('/goals', authenticateToken, createGoalHandler);
router.get('/goals', authenticateToken, getGoalsHandler);
router.get('/goals/summary', authenticateToken, getGoalsSummaryHandler);
router.get('/goals/:id', authenticateToken, getGoalByIdHandler);
router.put('/goals/:id', authenticateToken, updateGoalHandler);
router.post('/goals/:id/add', authenticateToken, addToGoalHandler);
router.delete('/goals/:id', authenticateToken, deleteGoalHandler);

module.exports = router;

