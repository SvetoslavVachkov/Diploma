const { FinancialTransaction, FinancialCategory, User } = require('../../models');
const { Op } = require('sequelize');

const createTransaction = async (userId, transactionData) => {
  try {
    const category = await FinancialCategory.findByPk(transactionData.category_id);
    
    if (!category) {
      throw new Error('Category not found');
    }

    if (category.type !== transactionData.type) {
      throw new Error('Category type does not match transaction type');
    }

    const transaction = await FinancialTransaction.create({
      user_id: userId,
      category_id: transactionData.category_id,
      amount: Math.abs(parseFloat(transactionData.amount)),
      description: transactionData.description || null,
      transaction_date: transactionData.transaction_date || new Date(),
      type: transactionData.type,
      source: transactionData.source || null,
      tags: transactionData.tags || null,
      location: transactionData.location || null,
      is_recurring: transactionData.is_recurring || false,
      recurring_pattern: transactionData.recurring_pattern || null
    });

    return {
      success: true,
      transaction: transaction.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateTransaction = async (transactionId, userId, updateData) => {
  try {
    const transaction = await FinancialTransaction.findOne({
      where: {
        id: transactionId,
        user_id: userId
      }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (updateData.category_id) {
      const category = await FinancialCategory.findByPk(updateData.category_id);
      if (!category) {
        throw new Error('Category not found');
      }
      if (category.type !== (updateData.type || transaction.type)) {
        throw new Error('Category type does not match transaction type');
      }
    }

    const allowedFields = ['category_id', 'amount', 'description', 'transaction_date', 'type', 'source', 'tags', 'location', 'is_recurring', 'recurring_pattern'];
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

    await transaction.update(updateFields);

    return {
      success: true,
      transaction: transaction.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteTransaction = async (transactionId, userId) => {
  try {
    const transaction = await FinancialTransaction.findOne({
      where: {
        id: transactionId,
        user_id: userId
      }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    await transaction.destroy();

    return {
      success: true,
      message: 'Transaction deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getTransactions = async (userId, filters = {}, pagination = {}) => {
  try {
    const page = parseInt(pagination.page) || 1;
    const limit = Math.min(parseInt(pagination.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = {
      user_id: userId
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.category_id) {
      where.category_id = filters.category_id;
    }

    if (filters.date_from || filters.date_to) {
      where.transaction_date = {};
      if (filters.date_from) {
        where.transaction_date[Op.gte] = filters.date_from;
      }
      if (filters.date_to) {
        where.transaction_date[Op.lte] = filters.date_to;
      }
    }

    if (filters.min_amount) {
      where.amount = { [Op.gte]: parseFloat(filters.min_amount) };
    }

    if (filters.max_amount) {
      if (where.amount) {
        where.amount[Op.lte] = parseFloat(filters.max_amount);
      } else {
        where.amount = { [Op.lte]: parseFloat(filters.max_amount) };
      }
    }

    if (filters.is_recurring !== undefined) {
      where.is_recurring = filters.is_recurring === 'true' || filters.is_recurring === true;
    }

    const { count, rows } = await FinancialTransaction.findAndCountAll({
      where,
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }],
      order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      success: true,
      transactions: rows.map(t => t.toJSON()),
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getTransactionById = async (transactionId, userId) => {
  try {
    const transaction = await FinancialTransaction.findOne({
      where: {
        id: transactionId,
        user_id: userId
      },
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }]
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return {
      success: true,
      transaction: transaction.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getTransactionSummary = async (userId, dateFrom, dateTo) => {
  try {
    const where = {
      user_id: userId
    };

    if (dateFrom || dateTo) {
      where.transaction_date = {};
      if (dateFrom) {
        where.transaction_date[Op.gte] = dateFrom;
      }
      if (dateTo) {
        where.transaction_date[Op.lte] = dateTo;
      }
    }

    const transactions = await FinancialTransaction.findAll({
      where,
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type']
      }]
    });

    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const balance = totalIncome - totalExpense;

    const byCategory = {};
    transactions.forEach(t => {
      const catId = t.category_id;
      if (!byCategory[catId]) {
        byCategory[catId] = {
          category: t.category.name,
          type: t.category.type,
          count: 0,
          total: 0
        };
      }
      byCategory[catId].count++;
      byCategory[catId].total += parseFloat(t.amount);
    });

    return {
      success: true,
      summary: {
        totalIncome,
        totalExpense,
        balance,
        transactionCount: transactions.length,
        byCategory: Object.values(byCategory)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactions,
  getTransactionById,
  getTransactionSummary
};

