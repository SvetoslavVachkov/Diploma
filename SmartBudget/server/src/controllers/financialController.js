const { FinancialCategory } = require('../models');
const { createTransaction, updateTransaction, deleteTransaction, getTransactions, getTransactionById, getTransactionSummary } = require('../services/financial/transactionService');
const { createBudget, updateBudget, deleteBudget, getBudgets, getBudgetById, updateAllBudgetsSpentAmount } = require('../services/financial/budgetService');
const { getMonthlyReport, getYearlyReport, getCategoryBreakdown, getTrends } = require('../services/financial/analyticsService');

const getCategories = async (req, res) => {
  try {
    const type = req.query.type;
    const where = { is_active: true };
    
    if (type && (type === 'income' || type === 'expense')) {
      where.type = type;
    }

    const categories = await FinancialCategory.findAll({
      where,
      order: [['type', 'ASC'], ['name', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

const createTransactionHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await createTransaction(userId, req.body);

    if (result.success) {
      await updateAllBudgetsSpentAmount(userId);
      res.status(201).json({
        status: 'success',
        data: result.transaction
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create transaction',
      error: error.message
    });
  }
};

const updateTransactionHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await updateTransaction(transactionId, userId, req.body);

    if (result.success) {
      await updateAllBudgetsSpentAmount(userId);
      res.status(200).json({
        status: 'success',
        data: result.transaction
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to update transaction',
      error: error.message
    });
  }
};

const deleteTransactionHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await deleteTransaction(transactionId, userId);

    if (result.success) {
      await updateAllBudgetsSpentAmount(userId);
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete transaction',
      error: error.message
    });
  }
};

const getTransactionsHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const filters = {
      type: req.query.type,
      category_id: req.query.category_id,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      min_amount: req.query.min_amount,
      max_amount: req.query.max_amount,
      is_recurring: req.query.is_recurring
    };

    const pagination = {
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await getTransactions(userId, filters, pagination);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.transactions,
        pagination: result.pagination
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

const getTransactionByIdHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await getTransactionById(transactionId, userId);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.transaction
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
};

const getTransactionSummaryHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await getTransactionSummary(
      userId,
      req.query.date_from,
      req.query.date_to
    );

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.summary
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get summary',
      error: error.message
    });
  }
};

const createBudgetHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await createBudget(userId, req.body);

    if (result.success) {
      res.status(201).json({
        status: 'success',
        data: result.budget
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create budget',
      error: error.message
    });
  }
};

const updateBudgetHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await updateBudget(budgetId, userId, req.body);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.budget
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to update budget',
      error: error.message
    });
  }
};

const deleteBudgetHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await deleteBudget(budgetId, userId);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete budget',
      error: error.message
    });
  }
};

const getBudgetsHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const filters = {
      is_active: req.query.is_active,
      period_type: req.query.period_type,
      category_id: req.query.category_id
    };

    const result = await getBudgets(userId, filters);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.budgets
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch budgets',
      error: error.message
    });
  }
};

const getBudgetByIdHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await getBudgetById(budgetId, userId);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.budget
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch budget',
      error: error.message
    });
  }
};

const getMonthlyReportHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const result = await getMonthlyReport(userId, year, month);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.report
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get monthly report',
      error: error.message
    });
  }
};

const getYearlyReportHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const year = parseInt(req.query.year) || new Date().getFullYear();

    const result = await getYearlyReport(userId, year);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.report
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get yearly report',
      error: error.message
    });
  }
};

const getCategoryBreakdownHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const result = await getCategoryBreakdown(
      userId,
      req.query.date_from,
      req.query.date_to,
      req.query.type
    );

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.breakdown
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get category breakdown',
      error: error.message
    });
  }
};

const getTrendsHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const period = req.query.period || 'monthly';
    const limit = parseInt(req.query.limit) || 6;

    const result = await getTrends(userId, period, limit);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.trends
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get trends',
      error: error.message
    });
  }
};

module.exports = {
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
};

