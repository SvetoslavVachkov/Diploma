const { FinancialTransaction, FinancialCategory } = require('../../models');
const { Op } = require('sequelize');
const { generateProfessionalReportAnalysis } = require('./reportAnalysisService');

const generateSpendingReport = async (userId, dateFrom, dateTo, searchQuery, skipAI = false) => {
  try {
    const where = {
      user_id: userId
    };

    if ((dateFrom && dateFrom.trim().length > 0) || (dateTo && dateTo.trim().length > 0)) {
      where.transaction_date = {};
      if (dateFrom && dateFrom.trim().length > 0) {
        let fromDate;
        const dateStr = dateFrom.trim();
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = dateStr.split('-');
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const day = parseInt(parts[2]);
          fromDate = new Date(year, month, day);
        } else if (dateStr.match(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/)) {
          const parts = dateStr.split(/[.\/]/);
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const year = parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
          fromDate = new Date(year, month, day);
        } else {
          fromDate = new Date(dateStr);
        }
        if (isNaN(fromDate.getTime())) {
          fromDate = new Date(dateStr + 'T00:00:00');
        }
        fromDate.setHours(0, 0, 0, 0);
        where.transaction_date[Op.gte] = fromDate;
      }
      if (dateTo && dateTo.trim().length > 0) {
        let toDate;
        const dateStr = dateTo.trim();
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parts = dateStr.split('-');
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const day = parseInt(parts[2]);
          toDate = new Date(year, month, day);
        } else if (dateStr.match(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/)) {
          const parts = dateStr.split(/[.\/]/);
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const year = parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
          toDate = new Date(year, month, day);
        } else {
          toDate = new Date(dateStr);
        }
        if (isNaN(toDate.getTime())) {
          toDate = new Date(dateStr + 'T23:59:59');
        }
        toDate.setHours(23, 59, 59, 999);
        where.transaction_date[Op.lte] = toDate;
      }
    }

    const includeOptions = [{
      model: FinancialCategory,
      as: 'category',
      attributes: ['id', 'name', 'type', 'icon', 'color'],
      required: false
    }];

    if (searchQuery) {
      where[Op.or] = [
        { description: { [Op.like]: `%${searchQuery}%` } },
        { '$category.name$': { [Op.like]: `%${searchQuery}%` } }
      ];
    }

    const transactions = await FinancialTransaction.findAll({
      where,
      include: includeOptions,
      order: [['transaction_date', 'DESC']]
    });

    const categoryTotals = {};
    let totalSpent = 0;
    let totalIncome = 0;

    if (transactions && transactions.length > 0) {
      transactions.forEach(t => {
        if (!t) return;
        const amount = Math.abs(parseFloat(t.amount || 0));
        if (isNaN(amount) || amount <= 0) return;

        if (t.type === 'income') {
          totalIncome += amount;
        } else if (t.type === 'expense') {
          totalSpent += amount;
        }

        const catId = t.category_id || 'unknown';
        const catName = (t.category && t.category.name) ? t.category.name : (t.type === 'income' ? 'Други приходи' : 'Други разходи');
      
      if (!categoryTotals[catId]) {
        categoryTotals[catId] = {
          category_id: catId,
          category_name: catName,
          total: 0,
          count: 0,
            type: t.type || 'expense',
          transactions: []
        };
      }
      
      categoryTotals[catId].total += amount;
      categoryTotals[catId].count++;
      categoryTotals[catId].transactions.push({
        id: t.id,
        amount: amount,
          description: t.description || 'Без описание',
          date: t.transaction_date,
          type: t.type
        });
      });
    }

    const expenseCategories = Object.values(categoryTotals).filter(cat => cat.type === 'expense');
    expenseCategories.sort((a, b) => (b.total || 0) - (a.total || 0));

    const topCategories = expenseCategories.slice(0, 5).map(cat => ({
      category_name: cat.category_name || 'Без име',
      total: cat.total || 0,
      count: cat.count || 0,
      percentage: totalSpent > 0 ? ((cat.total || 0) / totalSpent) * 100 : 0
    }));

    const validTransactions = transactions.filter(t => t && t.amount);
    const expenseTransactions = validTransactions.filter(t => t.type === 'expense');
    const averageTransaction = expenseTransactions.length > 0 ? totalSpent / expenseTransactions.length : 0;

    const dailySpending = {};
    if (expenseTransactions && expenseTransactions.length > 0) {
      expenseTransactions.forEach(t => {
        if (!t || !t.transaction_date) return;
      const date = t.transaction_date instanceof Date 
        ? t.transaction_date.toISOString().substring(0, 10)
        : String(t.transaction_date).substring(0, 10);
      if (!dailySpending[date]) {
        dailySpending[date] = 0;
      }
        dailySpending[date] += Math.abs(parseFloat(t.amount || 0));
    });
    }

    let highestSpendingDay = null;
    if (Object.keys(dailySpending).length > 0) {
      const sortedDays = Object.entries(dailySpending).filter(entry => entry && entry.length >= 2 && entry[1] > 0).sort((a, b) => (b[1] || 0) - (a[1] || 0));
      if (sortedDays.length > 0) {
        highestSpendingDay = sortedDays[0];
      }
    }

    const largestTransaction = expenseTransactions.length > 0
      ? expenseTransactions
          .map(t => { 
            const amount = Math.abs(parseFloat(t.amount || 0));
            if (amount <= 0) return null;
            return {
              amount: amount, 
              description: t.description || 'Без описание', 
            date: t.transaction_date instanceof Date 
              ? t.transaction_date.toISOString().substring(0, 10)
                : String(t.transaction_date || '').substring(0, 10)
            };
          })
          .filter(t => t && t.amount > 0)
          .sort((a, b) => (b.amount || 0) - (a.amount || 0))[0]
      : null;

    const reportData = {
        period: {
          date_from: dateFrom || null,
          date_to: dateTo || null
        },
        summary: {
          total_income: totalIncome || 0,
          total_spent: totalSpent || 0,
          balance: (totalIncome || 0) - (totalSpent || 0),
          transaction_count: validTransactions.length || 0,
          average_transaction: averageTransaction || 0,
          category_count: expenseCategories.length || 0
        },
        top_categories: topCategories,
      all_categories: expenseCategories.map(cat => ({
          category_name: cat.category_name,
          total: cat.total,
          count: cat.count,
          percentage: totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0
        })),
        insights: {
        highest_spending_day: highestSpendingDay && Array.isArray(highestSpendingDay) && highestSpendingDay.length >= 2 && highestSpendingDay[1] > 0 ? {
          date: String(highestSpendingDay[0]),
          amount: parseFloat(highestSpendingDay[1]) || 0
        } : null,
        largest_transaction: largestTransaction && largestTransaction.amount > 0 ? {
          description: String(largestTransaction.description || 'Без описание'),
          amount: parseFloat(largestTransaction.amount) || 0,
          date: largestTransaction.date || null
          } : null,
        most_frequent_category: expenseCategories.length > 0 && expenseCategories[0] && expenseCategories[0].category_name ? {
          category_name: String(expenseCategories[0].category_name),
          count: parseInt(expenseCategories[0].count) || 0
          } : null
        }
    };

    let aiAnalysis = null;
    if (!skipAI && validTransactions.length > 0 && process.env.OPENAI_API_KEY) {
      try {
        const analysisResult = await generateProfessionalReportAnalysis(reportData, {
          openaiApiKey: process.env.OPENAI_API_KEY,
          openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
        });
        if (analysisResult.success) {
          aiAnalysis = analysisResult.analysis;
        }
      } catch (error) {
        console.error('AI analysis error:', error.message);
      }
    }

    return {
      success: true,
      report: {
        ...reportData,
        ai_analysis: aiAnalysis
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
