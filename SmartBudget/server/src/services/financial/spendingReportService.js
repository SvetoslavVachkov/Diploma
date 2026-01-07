const { FinancialTransaction, FinancialCategory } = require('../../models');
const { Op } = require('sequelize');

const generateSpendingReport = async (userId, dateFrom, dateTo) => {
  try {
    const where = {
      user_id: userId,
      type: 'expense'
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
        attributes: ['id', 'name', 'type', 'icon', 'color']
      }],
      order: [['transaction_date', 'DESC']]
    });

    const categoryTotals = {};
    const totalSpent = transactions.reduce((sum, t) => {
      const amount = parseFloat(t.amount);
      const catId = t.category_id || 'unknown';
      const catName = (t.category && t.category.name) ? t.category.name : 'Други разходи';
      
      if (!categoryTotals[catId]) {
        categoryTotals[catId] = {
          category_id: catId,
          category_name: catName,
          total: 0,
          count: 0,
          transactions: []
        };
      }
      
      categoryTotals[catId].total += amount;
      categoryTotals[catId].count++;
      categoryTotals[catId].transactions.push({
        id: t.id,
        amount: amount,
        description: t.description || 'Без описание',
        date: t.transaction_date
      });
      
      return sum + amount;
    }, 0);

    const categoryArray = Object.values(categoryTotals);
    categoryArray.sort((a, b) => b.total - a.total);

    const topCategories = categoryArray.slice(0, 5).map(cat => ({
      category_name: cat.category_name,
      total: cat.total,
      count: cat.count,
      percentage: totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0
    }));

    const averageTransaction = transactions.length > 0 ? totalSpent / transactions.length : 0;

    const dailySpending = {};
    transactions.forEach(t => {
      const date = t.transaction_date instanceof Date 
        ? t.transaction_date.toISOString().substring(0, 10)
        : String(t.transaction_date).substring(0, 10);
      if (!dailySpending[date]) {
        dailySpending[date] = 0;
      }
      dailySpending[date] += parseFloat(t.amount);
    });

    const highestSpendingDay = Object.entries(dailySpending)
      .sort((a, b) => b[1] - a[1])[0];

    const largestTransaction = transactions.length > 0
      ? transactions
          .map(t => ({ 
            amount: parseFloat(t.amount), 
            description: t.description, 
            date: t.transaction_date instanceof Date 
              ? t.transaction_date.toISOString().substring(0, 10)
              : String(t.transaction_date).substring(0, 10)
          }))
          .sort((a, b) => b.amount - a.amount)[0]
      : null;

    return {
      success: true,
      report: {
        period: {
          date_from: dateFrom || null,
          date_to: dateTo || null
        },
        summary: {
          total_spent: totalSpent,
          transaction_count: transactions.length,
          average_transaction: averageTransaction,
          category_count: categoryArray.length
        },
        top_categories: topCategories,
        all_categories: categoryArray.map(cat => ({
          category_name: cat.category_name,
          total: cat.total,
          count: cat.count,
          percentage: totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0
        })),
        insights: {
          highest_spending_day: highestSpendingDay ? {
            date: highestSpendingDay[0],
            amount: highestSpendingDay[1]
          } : null,
          largest_transaction: largestTransaction || null,
          most_frequent_category: categoryArray.length > 0 ? {
            category_name: categoryArray[0].category_name,
            count: categoryArray[0].count
          } : null
        }
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
  generateSpendingReport
};

