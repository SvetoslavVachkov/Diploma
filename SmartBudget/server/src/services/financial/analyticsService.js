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
        attributes: ['id', 'name', 'type'],
        required: false
      }]
    });

    const validTransactions = transactions ? transactions.filter(t => t && t.amount) : [];

    const totalIncome = validTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

    const totalExpense = validTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

    const byCategory = {};
    validTransactions.forEach(t => {
      if (!t) return;
      const catId = t.category_id || 'unknown';
      const catName = (t.category && t.category.name) ? t.category.name : 'Други разходи';
      if (!byCategory[catId]) {
        byCategory[catId] = {
          category_id: catId,
          category_name: catName,
          type: t.type || 'expense',
          count: 0,
          total: 0
        };
      }
      byCategory[catId].count++;
      byCategory[catId].total += Math.abs(parseFloat(t.amount || 0));
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
        const spentTransactions = await FinancialTransaction.findAll({
          where: {
            user_id: userId,
            category_id: budget.category_id,
            type: 'expense',
            transaction_date: {
              [Op.gte]: budget.start_date,
              [Op.lte]: budget.end_date
            }
          }
        });
        
        const spent = spentTransactions.filter(t => t && t.amount).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

        return {
          category_id: budget.category_id,
          category_name: budget.category.name,
          budget_amount: parseFloat(budget.amount),
          spent_amount: spent,
          remaining: parseFloat(budget.amount) - spent,
          percentage: parseFloat(budget.amount) > 0 
            ? (spent / parseFloat(budget.amount)) * 100 
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
        byCategory: Object.values(byCategory).filter(cat => cat && cat.category_name).sort((a, b) => (b.total || 0) - (a.total || 0)),
        budgets: budgetStatus || [],
        transactionCount: validTransactions.length
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
        attributes: ['id', 'name', 'type'],
        required: false
      }]
    });

    const validTransactions = transactions ? transactions.filter(t => t && t.amount && t.transaction_date) : [];

    const monthlyData = {};
    for (let month = 1; month <= 12; month++) {
      monthlyData[month] = {
        income: 0,
        expense: 0,
        balance: 0,
        transactionCount: 0
      };
    }

    validTransactions.forEach(t => {
      if (!t || !t.transaction_date) return;
      try {
        const date = new Date(t.transaction_date);
        if (isNaN(date.getTime())) return;
        const month = date.getMonth() + 1;
        if (month < 1 || month > 12) return;
        const amount = Math.abs(parseFloat(t.amount || 0));
        if (isNaN(amount) || amount <= 0) return;
      
      if (t.type === 'income') {
        monthlyData[month].income += amount;
      } else {
        monthlyData[month].expense += amount;
      }
      monthlyData[month].transactionCount++;
      } catch (err) {
      }
    });

    Object.keys(monthlyData).forEach(month => {
      monthlyData[month].balance = monthlyData[month].income - monthlyData[month].expense;
    });

    const totalIncome = validTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

    const totalExpense = validTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);

    const byCategory = {};
    validTransactions.forEach(t => {
      if (!t) return;
      const catId = t.category_id || 'unknown';
      const catName = (t.category && t.category.name) ? t.category.name : 'Други разходи';
      if (!byCategory[catId]) {
        byCategory[catId] = {
          category_id: catId,
          category_name: catName,
          type: t.type || 'expense',
          count: 0,
          total: 0
        };
      }
      byCategory[catId].count++;
      byCategory[catId].total += Math.abs(parseFloat(t.amount || 0));
    });

    return {
      success: true,
      report: {
        year,
        totals: {
          income: totalIncome || 0,
          expense: totalExpense || 0,
          balance: (totalIncome || 0) - (totalExpense || 0)
        },
        monthly: monthlyData,
        byCategory: Object.values(byCategory).filter(cat => cat && cat.category_name).sort((a, b) => (b.total || 0) - (a.total || 0)),
        transactionCount: validTransactions.length
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
        attributes: ['id', 'name', 'type', 'icon', 'color'],
        required: false
      }]
    });

    const breakdown = {};
    transactions.forEach(t => {
      if (!t) return;
      const catId = t.category_id || 'unknown';
      const category = t.category || { id: catId, name: 'Други разходи', type: t.type || 'expense' };
      if (!breakdown[catId]) {
        breakdown[catId] = {
          category: category,
          count: 0,
          total: 0,
          average: 0
        };
      }
      breakdown[catId].count++;
      breakdown[catId].total += Math.abs(parseFloat(t.amount || 0));
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
      if (!t || !t.transaction_date) return;
      let key;
      try {
      if (period === 'monthly') {
        const date = new Date(t.transaction_date);
          if (isNaN(date.getTime())) return;
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'weekly') {
        const date = new Date(t.transaction_date);
          if (isNaN(date.getTime())) return;
        const week = Math.floor(date.getDate() / 7);
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-W${week}`;
      } else {
        const date = new Date(t.transaction_date);
          if (isNaN(date.getTime())) return;
        key = date.toISOString().substring(0, 10);
      }

        if (!key) return;

      if (!trends[key]) {
        trends[key] = {
          period: key,
          income: 0,
          expense: 0,
          balance: 0
        };
      }

        const amount = Math.abs(parseFloat(t.amount || 0));
        if (isNaN(amount) || amount <= 0) return;

      if (t.type === 'income') {
        trends[key].income += amount;
      } else {
        trends[key].expense += amount;
      }
      trends[key].balance = trends[key].income - trends[key].expense;
      } catch (err) {
      }
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

const getProductsAnalysis = async (userId, dateFrom, dateTo, searchQuery) => {
  try {
    const where = {
      user_id: userId
    };

    if (dateFrom || dateTo) {
      where.transaction_date = {};
      if (dateFrom) where.transaction_date[Op.gte] = dateFrom;
      if (dateTo) where.transaction_date[Op.lte] = dateTo;
    }

    const { ReceiptProduct, FinancialTransaction } = require('../../models');
    
    const transactionWhere = { ...where };
    if (searchQuery) {
      transactionWhere[Op.or] = [
        { description: { [Op.like]: `%${searchQuery}%` } },
        { '$category.name$': { [Op.like]: `%${searchQuery}%` } }
      ];
    }

    const transactions = await FinancialTransaction.findAll({
      where: transactionWhere,
      include: [{
        model: require('../../models').FinancialCategory,
        as: 'category',
        attributes: ['id', 'name'],
        required: false
      }]
    });

    const transactionIds = transactions.filter(t => t && t.id).map(t => t.id);

    if (transactionIds.length === 0) {
      return {
        success: true,
        top_products: [],
        ai_recommendations: []
      };
    }

    const receiptProducts = await ReceiptProduct.findAll({
      where: {
        transaction_id: { [Op.in]: transactionIds }
      }
    });

    const productStats = {};
    receiptProducts.forEach(rp => {
      const key = rp.product_name.toLowerCase().trim();
      if (!productStats[key]) {
        productStats[key] = {
          product_name: rp.product_name,
          purchase_count: 0,
          total_spent: 0,
          category: rp.category,
          subcategory: rp.subcategory
        };
      }
      productStats[key].purchase_count++;
      productStats[key].total_spent += parseFloat(rp.total_price || 0);
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 20);

    let aiRecommendations = [];
    if (topProducts.length > 0 && process.env.GROQ_API_KEY) {
      try {
        const axios = require('axios');
        const prompt = `Анализирай тези продукти от бележки и дай конкретни съвети как потребителят може да промени купувателските си навици за да спести пари и да подобри здравето си.

Топ продукти (най-купувани):
${topProducts.slice(0, 10).map((p, i) => `${i + 1}. ${p.product_name} - купени ${p.purchase_count} пъти, общо ${p.total_spent.toFixed(2)} лв${p.category ? ` (${p.category})` : ''}`).join('\n')}

Давай 3-5 конкретни съвета на български език как да намали разходите и да подобри здравословния начин на живот. Бъди конкретен и практичен.`;

        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content: 'Ти си експертен финансов и здравословен съветник. Давай практични съвети базирани на продукти от бележки.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 500
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const content = response.data.choices[0].message?.content?.trim() || '';
          if (content) {
            const lines = content.split('\n').filter(l => l.trim().length > 20);
            aiRecommendations = lines.slice(0, 5).map(l => l.trim().replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, ''));
          }
        }
      } catch (error) {
      }
    }

    return {
      success: true,
      top_products: topProducts,
      ai_recommendations: aiRecommendations
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
  getTrends,
  getProductsAnalysis
};

