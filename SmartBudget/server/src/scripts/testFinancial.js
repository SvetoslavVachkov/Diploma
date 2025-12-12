require('dotenv').config();
const axios = require('axios');
const { sequelize, FinancialTransaction, FinancialCategory, Budget, User } = require('../models');
const { createTransaction, getTransactions, getTransactionSummary } = require('../services/financial/transactionService');
const { createBudget, getBudgets } = require('../services/financial/budgetService');
const { getMonthlyReport, getCategoryBreakdown } = require('../services/financial/analyticsService');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

const log = (color, message) => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const testDatabaseConnection = async () => {
  log('blue', '\n=== 1. Testing Database Connection ===');
  try {
    await sequelize.authenticate();
    log('green', '✓ Database connection successful');
    return true;
  } catch (error) {
    log('red', `✗ Database connection failed: ${error.message}`);
    return false;
  }
};

const testFinancialCategories = async () => {
  log('blue', '\n=== 2. Testing Financial Categories ===');
  try {
    const categories = await FinancialCategory.findAll({
      where: { is_active: true }
    });

    log('green', `✓ Found ${categories.length} financial categories`);
    
    const incomeCategories = categories.filter(c => c.type === 'income');
    const expenseCategories = categories.filter(c => c.type === 'expense');
    
    console.log(`   Income categories: ${incomeCategories.length}`);
    console.log(`   Expense categories: ${expenseCategories.length}`);

    return { success: true, categories };
  } catch (error) {
    log('red', `✗ Failed to fetch categories: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testTransactionService = async () => {
  log('blue', '\n=== 3. Testing Transaction Service ===');
  
  try {
    const user = await User.findOne();
    if (!user) {
      log('yellow', '⚠ No user found. Skipping transaction tests.');
      return { success: false, skipped: true };
    }

    const expenseCategory = await FinancialCategory.findOne({
      where: { type: 'expense', is_active: true }
    });

    if (!expenseCategory) {
      log('yellow', '⚠ No expense category found. Skipping transaction tests.');
      return { success: false, skipped: true };
    }

    const testTransaction = {
      category_id: expenseCategory.id,
      amount: 50.00,
      description: 'Test transaction',
      transaction_date: new Date().toISOString().substring(0, 10),
      type: 'expense'
    };

    const createResult = await createTransaction(user.id, testTransaction);
    
    if (createResult.success) {
      log('green', '✓ Transaction created successfully');
      console.log(`   Transaction ID: ${createResult.transaction.id}`);
      console.log(`   Amount: ${createResult.transaction.amount}`);

      const getResult = await getTransactions(user.id, {}, { page: 1, limit: 5 });
      if (getResult.success) {
        log('green', `✓ Retrieved ${getResult.transactions.length} transactions`);
      }

      const summaryResult = await getTransactionSummary(user.id);
      if (summaryResult.success) {
        log('green', '✓ Transaction summary generated');
        console.log(`   Total Income: ${summaryResult.summary.totalIncome}`);
        console.log(`   Total Expense: ${summaryResult.summary.totalExpense}`);
        console.log(`   Balance: ${summaryResult.summary.balance}`);
      }

      return { success: true, transactionId: createResult.transaction.id };
    } else {
      log('red', `✗ Failed to create transaction: ${createResult.error}`);
      return { success: false, error: createResult.error };
    }
  } catch (error) {
    log('red', `✗ Transaction service test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testBudgetService = async () => {
  log('blue', '\n=== 4. Testing Budget Service ===');
  
  try {
    const user = await User.findOne();
    if (!user) {
      log('yellow', '⚠ No user found. Skipping budget tests.');
      return { success: false, skipped: true };
    }

    const expenseCategory = await FinancialCategory.findOne({
      where: { type: 'expense', is_active: true }
    });

    if (!expenseCategory) {
      log('yellow', '⚠ No expense category found. Skipping budget tests.');
      return { success: false, skipped: true };
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const testBudget = {
      category_id: expenseCategory.id,
      amount: 500.00,
      period_type: 'monthly',
      start_date: startDate.toISOString().substring(0, 10),
      end_date: endDate.toISOString().substring(0, 10)
    };

    const createResult = await createBudget(user.id, testBudget);
    
    if (createResult.success) {
      log('green', '✓ Budget created successfully');
      console.log(`   Budget ID: ${createResult.budget.id}`);
      console.log(`   Amount: ${createResult.budget.amount}`);

      const getResult = await getBudgets(user.id);
      if (getResult.success) {
        log('green', `✓ Retrieved ${getResult.budgets.length} budgets`);
        if (getResult.budgets.length > 0) {
          const budget = getResult.budgets[0];
          console.log(`   Status: ${budget.status.percentage.toFixed(2)}% spent`);
        }
      }

      return { success: true, budgetId: createResult.budget.id };
    } else {
      log('red', `✗ Failed to create budget: ${createResult.error}`);
      return { success: false, error: createResult.error };
    }
  } catch (error) {
    log('red', `✗ Budget service test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testAnalyticsService = async () => {
  log('blue', '\n=== 5. Testing Analytics Service ===');
  
  try {
    const user = await User.findOne();
    if (!user) {
      log('yellow', '⚠ No user found. Skipping analytics tests.');
      return { success: false, skipped: true };
    }

    const currentDate = new Date();
    const monthlyReport = await getMonthlyReport(
      user.id,
      currentDate.getFullYear(),
      currentDate.getMonth() + 1
    );

    if (monthlyReport.success) {
      log('green', '✓ Monthly report generated');
      console.log(`   Income: ${monthlyReport.report.totals.income}`);
      console.log(`   Expense: ${monthlyReport.report.totals.expense}`);
      console.log(`   Balance: ${monthlyReport.report.totals.balance}`);
    }

    const breakdown = await getCategoryBreakdown(user.id, null, null, 'expense');
    if (breakdown.success) {
      log('green', `✓ Category breakdown: ${breakdown.breakdown.length} categories`);
    }

    return { success: true };
  } catch (error) {
    log('red', `✗ Analytics service test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testAPIEndpoints = async () => {
  log('blue', '\n=== 6. Testing API Endpoints ===');
  
  try {
    log('yellow', 'Checking if server is running...');
    const healthCheck = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 5000 });
    
    if (healthCheck.data.status === 'OK') {
      log('green', '✓ Server is running');
    }
  } catch (error) {
    log('red', `✗ Server not running at ${API_BASE_URL}`);
    log('yellow', '⚠ Skipping API endpoint tests. Start server with: npm run dev');
    return { success: false, skipped: true };
  }

  try {
    log('blue', '\nTesting GET /api/financial/categories...');
    const categoriesResponse = await axios.get(`${API_BASE_URL}/api/financial/categories`, {
      timeout: 10000
    });
    
    if (categoriesResponse.data.status === 'success') {
      log('green', `✓ Categories endpoint: ${categoriesResponse.data.data.length} categories`);
    }

    return { success: true };
  } catch (error) {
    log('red', `✗ API testing failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
};

const runAllTests = async () => {
  log('blue', '\n' + '='.repeat(60));
  log('blue', '  FINANCIAL MODULE - TEST SUITE');
  log('blue', '='.repeat(60));

  const results = {};

  results.database = await testDatabaseConnection();
  if (!results.database) {
    log('red', '\n✗ Cannot continue without database connection');
    process.exit(1);
  }

  results.categories = await testFinancialCategories();
  results.transactions = await testTransactionService();
  results.budgets = await testBudgetService();
  results.analytics = await testAnalyticsService();
  results.api = await testAPIEndpoints();

  log('blue', '\n' + '='.repeat(60));
  log('blue', '=== TEST SUMMARY ===');
  log('blue', '='.repeat(60));

  const checks = [
    { name: 'Database Connection', result: results.database },
    { name: 'Financial Categories', result: results.categories.success },
    { name: 'Transaction Service', result: results.transactions.success !== false },
    { name: 'Budget Service', result: results.budgets.success !== false },
    { name: 'Analytics Service', result: results.analytics.success !== false },
    { name: 'API Endpoints', result: results.api?.success !== false }
  ];

  checks.forEach(check => {
    const icon = check.result ? '✓' : '✗';
    const color = check.result ? 'green' : 'red';
    log(color, `${icon} ${check.name}`);
  });

  const allPassed = checks.every(check => check.result);

  if (allPassed) {
    log('green', '\n✓ All tests passed!');
  } else {
    log('yellow', '\n⚠ Some tests failed or were skipped. Check the output above.');
  }

  log('blue', '='.repeat(60) + '\n');

  process.exit(0);
};

runAllTests().catch(error => {
  log('red', `\n✗ Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

