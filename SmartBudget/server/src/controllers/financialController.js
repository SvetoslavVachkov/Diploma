const { FinancialCategory, FinancialTransaction } = require('../models');
const { Op } = require('sequelize');
const { normalizeMerchantKey, setMerchantOverride } = require('../services/financial/transactionCategorizationService');
const { createTransaction, updateTransaction, deleteTransaction, getTransactions, getTransactionById, getTransactionSummary } = require('../services/financial/transactionService');
const { createBudget, updateBudget, deleteBudget, getBudgets, getBudgetById, updateAllBudgetsSpentAmount } = require('../services/financial/budgetService');
const { getMonthlyReport, getYearlyReport, getCategoryBreakdown, getTrends } = require('../services/financial/analyticsService');
const { createGoal, updateGoal, deleteGoal, getGoals, getGoalById, addToGoal, getGoalsSummary } = require('../services/financial/goalService');

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

const createCategory = async (req, res) => {
  try {
    const { name, type, icon, color } = req.body;
    
    if (!name || !type || (type !== 'income' && type !== 'expense')) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and type (income/expense) are required'
      });
    }

    const existing = await FinancialCategory.findOne({
      where: { name, type, is_active: true }
    });

    if (existing) {
      return res.status(200).json({
        status: 'success',
        data: existing
      });
    }

    const category = await FinancialCategory.create({
      name,
      type,
      icon: icon || null,
      color: color || null,
      is_active: true
    });

    res.status(201).json({
      status: 'success',
      data: category
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create category',
      error: error.message
    });
  }
};

const createTransactionHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    let transactionData = { ...req.body };

    if (transactionData.description && !transactionData.category_id) {
      const { categorizeTransaction } = require('../services/financial/transactionCategorizationService');
      const amount = parseFloat(transactionData.amount) || 0;
      const categorization = await categorizeTransaction(transactionData.description, amount, {
        hfApiKey: process.env.HF_TXN_API_KEY,
        hfModel: process.env.HF_TXN_MODEL
      });
      
      if (categorization.success && categorization.result) {
        transactionData.category_id = categorization.result.categoryId;
        if (!transactionData.type) {
          transactionData.type = categorization.result.type;
        }
      }
    }

    const result = await createTransaction(userId, transactionData);

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
    const userId = req.user?.id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const rememberCategoryRule = req.body?.remember_category === true || req.body?.remember_category === 'true';
    const applyToExisting = req.body?.apply_to_existing === undefined
      ? rememberCategoryRule
      : (req.body?.apply_to_existing === true || req.body?.apply_to_existing === 'true');

    const result = await updateTransaction(transactionId, userId, req.body);

    if (result.success) {
      if (rememberCategoryRule && req.body?.category_id && result.transaction?.description) {
        try {
          const merchantKey = normalizeMerchantKey(result.transaction.description);
          if (merchantKey) {
            const category = await FinancialCategory.findByPk(req.body.category_id);
            if (category && category.type === (result.transaction.type || category.type)) {
              await setMerchantOverride(userId, result.transaction.type, merchantKey, category.id, category.name);

              if (applyToExisting) {
                await FinancialTransaction.update(
                  { category_id: category.id },
                  {
                    where: {
                      user_id: userId,
                      type: result.transaction.type,
                      description: { [Op.like]: `%${merchantKey}%` }
                    }
                  }
                );
              }
            }
          }
        } catch (e) {
        }
      }

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
    const userId = req.user?.id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
        data: {
          transactions: result.transactions,
          pagination: result.pagination
        }
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
    const userId = req.user?.id;
    const transactionId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    const budgetId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
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

const createGoalHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await createGoal(userId, req.body);

    if (result.success) {
      res.status(201).json({
        status: 'success',
        data: result.goal
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
      message: 'Failed to create goal',
      error: error.message
    });
  }
};

const updateGoalHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const goalId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await updateGoal(goalId, userId, req.body);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.goal
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
      message: 'Failed to update goal',
      error: error.message
    });
  }
};

const deleteGoalHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const goalId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await deleteGoal(goalId, userId);

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
      message: 'Failed to delete goal',
      error: error.message
    });
  }
};

const getGoalsHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const filters = {
      is_achieved: req.query.is_achieved,
      goal_type: req.query.goal_type
    };

    const result = await getGoals(userId, filters);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.goals
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
      message: 'Failed to fetch goals',
      error: error.message
    });
  }
};

const getGoalByIdHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const goalId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await getGoalById(goalId, userId);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.goal
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
      message: 'Failed to fetch goal',
      error: error.message
    });
  }
};

const addToGoalHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const goalId = req.params.id;
    const { amount } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Valid amount is required'
      });
    }

    const result = await addToGoal(goalId, userId, amount);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.goal
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
      message: 'Failed to add to goal',
      error: error.message
    });
  }
};

const getGoalsSummaryHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await getGoalsSummary(userId);

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
      message: 'Failed to get goals summary',
      error: error.message
    });
  }
};

module.exports = {
  getCategories,
  createCategory,
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
};

