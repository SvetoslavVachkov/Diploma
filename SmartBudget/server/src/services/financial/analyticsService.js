const { FinancialTransaction, FinancialCategory, Budget } = require('../../models');
const { Op } = require('sequelize');

const getMonthlyReport = async (userId, year, month) => {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const transactions = await FinancialTransaction.findAll({
      where: {
        user_id: userId,
        transaction_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
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

    const byCategory = {};
    transactions.forEach(t => {
      const catId = t.category_id;
      if (!byCategory[catId]) {
        byCategory[catId] = {
          category_id: catId,
          category_name: t.category.name,
          type: t.type,
          count: 0,
          total: 0
        };
      }
      byCategory[catId].count++;
      byCategory[catId].total += parseFloat(t.amount);
    });

    const budgets = await Budget.findAll({
      where: {
        user_id: userId,
        is_active: true,
        start_date: { [Op.lte]: endDate },
        end_date: { [Op.gte]: startDate }
      },
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name']
      }]
    });

    const budgetStatus = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await FinancialTransaction.sum('amount', {
          where: {
            user_id: userId,
            category_id: budget.category_id,
            type: 'expense',
            transaction_date: {
              [Op.gte]: budget.start_date,
              [Op.lte]: budget.end_date
            }
          }
        }) || 0;

        return {
          category_id: budget.category_id,
          category_name: budget.category.name,
          budget_amount: parseFloat(budget.amount),
          spent_amount: parseFloat(spent),
          remaining: parseFloat(budget.amount) - parseFloat(spent),
          percentage: parseFloat(budget.amount) > 0 
            ? (parseFloat(spent) / parseFloat(budget.amount)) * 100 
            : 0
        };
      })
    );

    return {
      success: true,
      report: {
        period: {
          year,
          month,
          start_date: startDate.toISOString().substring(0, 10),
          end_date: endDate.toISOString().substring(0, 10)
        },
        totals: {
          income: totalIncome,
          expense: totalExpense,
          balance: totalIncome - totalExpense
        },
        byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
        budgets: budgetStatus,
        transactionCount: transactions.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getYearlyReport = async (userId, year) => {
  try {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const transactions = await FinancialTransaction.findAll({
      where: {
        user_id: userId,
        transaction_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type']
      }]
    });

    const monthlyData = {};
    for (let month = 1; month <= 12; month++) {
      monthlyData[month] = {
        income: 0,
        expense: 0,
        balance: 0,
        transactionCount: 0
      };
    }

    transactions.forEach(t => {
      const month = new Date(t.transaction_date).getMonth() + 1;
      const amount = parseFloat(t.amount);
      
      if (t.type === 'income') {
        monthlyData[month].income += amount;
      } else {
        monthlyData[month].expense += amount;
      }
      monthlyData[month].transactionCount++;
    });

    Object.keys(monthlyData).forEach(month => {
      monthlyData[month].balance = monthlyData[month].income - monthlyData[month].expense;
    });

    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const byCategory = {};
    transactions.forEach(t => {
      const catId = t.category_id;
      if (!byCategory[catId]) {
        byCategory[catId] = {
          category_id: catId,
          category_name: t.category.name,
          type: t.type,
          count: 0,
          total: 0
        };
      }
      byCategory[catId].count++;
      byCategory[catId].total += parseFloat(t.amount);
    });

    return {
      success: true,
      report: {
        year,
        totals: {
          income: totalIncome,
          expense: totalExpense,
          balance: totalIncome - totalExpense
        },
        monthly: monthlyData,
        byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
        transactionCount: transactions.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getCategoryBreakdown = async (userId, dateFrom, dateTo, type) => {
  try {
    const where = {
      user_id: userId
    };

    if (type) {
      where.type = type;
    }

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
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }]
    });

    const breakdown = {};
    transactions.forEach(t => {
      const catId = t.category_id;
      if (!breakdown[catId]) {
        breakdown[catId] = {
          category: t.category,
          count: 0,
          total: 0,
          average: 0
        };
      }
      breakdown[catId].count++;
      breakdown[catId].total += parseFloat(t.amount);
    });

    Object.keys(breakdown).forEach(catId => {
      breakdown[catId].average = breakdown[catId].total / breakdown[catId].count;
    });

    return {
      success: true,
      breakdown: Object.values(breakdown).sort((a, b) => b.total - a.total)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getTrends = async (userId, period = 'monthly', limit = 6) => {
  try {
    const endDate = new Date();
    let startDate = new Date();

    if (period === 'monthly') {
      startDate.setMonth(startDate.getMonth() - limit);
    } else if (period === 'weekly') {
      startDate.setDate(startDate.getDate() - (limit * 7));
    } else {
      startDate.setDate(startDate.getDate() - limit);
    }

    const transactions = await FinancialTransaction.findAll({
      where: {
        user_id: userId,
        transaction_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      }
    });

    const trends = {};

    transactions.forEach(t => {
      let key;
      if (period === 'monthly') {
        const date = new Date(t.transaction_date);
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'weekly') {
        const date = new Date(t.transaction_date);
        const week = Math.floor(date.getDate() / 7);
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-W${week}`;
      } else {
        const date = new Date(t.transaction_date);
        key = date.toISOString().substring(0, 10);
      }

      if (!trends[key]) {
        trends[key] = {
          period: key,
          income: 0,
          expense: 0,
          balance: 0
        };
      }

      const amount = parseFloat(t.amount);
      if (t.type === 'income') {
        trends[key].income += amount;
      } else {
        trends[key].expense += amount;
      }
      trends[key].balance = trends[key].income - trends[key].expense;
    });

    return {
      success: true,
      trends: Object.values(trends).sort((a, b) => a.period.localeCompare(b.period))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  getMonthlyReport,
  getYearlyReport,
  getCategoryBreakdown,
  getTrends
};

