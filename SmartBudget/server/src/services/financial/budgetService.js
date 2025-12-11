const { Budget, FinancialCategory, FinancialTransaction } = require('../../models');
const { Op } = require('sequelize');

const createBudget = async (userId, budgetData) => {
  try {
    const category = await FinancialCategory.findByPk(budgetData.category_id);
    
    if (!category) {
      throw new Error('Category not found');
    }

    if (category.type !== 'expense') {
      throw new Error('Budget can only be created for expense categories');
    }

    const startDate = new Date(budgetData.start_date);
    const endDate = new Date(budgetData.end_date);

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    const budget = await Budget.create({
      user_id: userId,
      category_id: budgetData.category_id,
      amount: Math.abs(parseFloat(budgetData.amount)),
      period_type: budgetData.period_type,
      start_date: budgetData.start_date,
      end_date: budgetData.end_date,
      spent_amount: 0.00,
      is_active: budgetData.is_active !== undefined ? budgetData.is_active : true
    });

    return {
      success: true,
      budget: budget.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateBudget = async (budgetId, userId, updateData) => {
  try {
    const budget = await Budget.findOne({
      where: {
        id: budgetId,
        user_id: userId
      }
    });

    if (!budget) {
      throw new Error('Budget not found');
    }

    const allowedFields = ['amount', 'start_date', 'end_date', 'period_type', 'is_active'];
    const updateFields = {};
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'amount') {
          updateFields[field] = Math.abs(parseFloat(updateData[field]));
        } else {
          updateFields[field] = updateData[field];
        }
      }
    });

    if (updateFields.end_date && updateFields.start_date) {
      if (new Date(updateFields.end_date) <= new Date(updateFields.start_date)) {
        throw new Error('End date must be after start date');
      }
    }

    await budget.update(updateFields);

    await updateBudgetSpentAmount(budget.id);

    return {
      success: true,
      budget: budget.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteBudget = async (budgetId, userId) => {
  try {
    const budget = await Budget.findOne({
      where: {
        id: budgetId,
        user_id: userId
      }
    });

    if (!budget) {
      throw new Error('Budget not found');
    }

    await budget.destroy();

    return {
      success: true,
      message: 'Budget deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getBudgets = async (userId, filters = {}) => {
  try {
    const where = {
      user_id: userId
    };

    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active === 'true' || filters.is_active === true;
    }

    if (filters.period_type) {
      where.period_type = filters.period_type;
    }

    if (filters.category_id) {
      where.category_id = filters.category_id;
    }

    const budgets = await Budget.findAll({
      where,
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }],
      order: [['start_date', 'DESC']]
    });

    const budgetsWithStatus = await Promise.all(
      budgets.map(async (budget) => {
        await updateBudgetSpentAmount(budget.id);
        await budget.reload();
        
        const budgetData = budget.toJSON();
        const spent = parseFloat(budgetData.spent_amount);
        const amount = parseFloat(budgetData.amount);
        const remaining = amount - spent;
        const percentage = amount > 0 ? (spent / amount) * 100 : 0;
        
        budgetData.status = {
          spent,
          remaining,
          percentage: Math.round(percentage * 100) / 100,
          isExceeded: spent > amount
        };

        return budgetData;
      })
    );

    return {
      success: true,
      budgets: budgetsWithStatus
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getBudgetById = async (budgetId, userId) => {
  try {
    const budget = await Budget.findOne({
      where: {
        id: budgetId,
        user_id: userId
      },
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }]
    });

    if (!budget) {
      throw new Error('Budget not found');
    }

    await updateBudgetSpentAmount(budget.id);
    await budget.reload();

    const budgetData = budget.toJSON();
    const spent = parseFloat(budgetData.spent_amount);
    const amount = parseFloat(budgetData.amount);
    const remaining = amount - spent;
    const percentage = amount > 0 ? (spent / amount) * 100 : 0;

    budgetData.status = {
      spent,
      remaining,
      percentage: Math.round(percentage * 100) / 100,
      isExceeded: spent > amount
    };

    return {
      success: true,
      budget: budgetData
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateBudgetSpentAmount = async (budgetId) => {
  try {
    const budget = await Budget.findByPk(budgetId);
    
    if (!budget) {
      return;
    }

    const spent = await FinancialTransaction.sum('amount', {
      where: {
        user_id: budget.user_id,
        category_id: budget.category_id,
        type: 'expense',
        transaction_date: {
          [Op.gte]: budget.start_date,
          [Op.lte]: budget.end_date
        }
      }
    });

    await budget.update({
      spent_amount: spent || 0.00
    });
  } catch (error) {
    console.error('Error updating budget spent amount:', error.message);
  }
};

const updateAllBudgetsSpentAmount = async (userId) => {
  try {
    const budgets = await Budget.findAll({
      where: {
        user_id: userId,
        is_active: true
      }
    });

    await Promise.all(
      budgets.map(budget => updateBudgetSpentAmount(budget.id))
    );

    return {
      success: true,
      updated: budgets.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgets,
  getBudgetById,
  updateBudgetSpentAmount,
  updateAllBudgetsSpentAmount
};

