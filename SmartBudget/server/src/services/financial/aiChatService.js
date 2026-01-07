const axios = require('axios');
const { FinancialTransaction, FinancialCategory } = require('../../models');
const { Op } = require('sequelize');

const getFinancialContext = async (userId, periodDays = 30) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

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
    }],
    order: [['transaction_date', 'DESC']]
  });

  const income = transactions.filter(t => t.type === 'income');
  const expenses = transactions.filter(t => t.type === 'expense');

  const totalIncome = income.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalExpense = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const byCategory = {};
  expenses.forEach(t => {
    const catName = t.category?.name || 'Unknown';
    if (!byCategory[catName]) {
      byCategory[catName] = { total: 0, count: 0, transactions: [] };
    }
    byCategory[catName].total += parseFloat(t.amount);
    byCategory[catName].count += 1;
    byCategory[catName].transactions.push({
      date: t.transaction_date,
      amount: parseFloat(t.amount),
      description: t.description
    });
  });

  const categoryBreakdown = Object.entries(byCategory)
    .map(([name, data]) => ({
      category: name,
      total: data.total,
      count: data.count,
      average: data.total / data.count,
      percentage: (data.total / totalExpense) * 100
    }))
    .sort((a, b) => b.total - a.total);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const monthStart = new Date(currentYear, currentMonth - 1, 1);
  const monthEnd = new Date(currentYear, currentMonth, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const monthIncome = income
    .filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd;
    })
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const monthExpense = expenses
    .filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd;
    })
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return {
    period: {
      days: periodDays,
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    },
    totals: {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense
    },
    currentMonth: {
      income: monthIncome,
      expense: monthExpense,
      balance: monthIncome - monthExpense
    },
    categories: categoryBreakdown,
    topCategories: categoryBreakdown.slice(0, 5),
    transactionCount: {
      income: income.length,
      expense: expenses.length,
      total: transactions.length
    }
  };
};

const chatWithAI = async (userId, userMessage, apiKey, model) => {
  if (!apiKey || !model) {
    return {
      success: false,
      error: 'AI not configured. Add HF_TXN_API_KEY to .env'
    };
  }

  const context = await getFinancialContext(userId, 90);

  const prompt = `You are a financial advisor AI assistant. Analyze the user's financial data and answer their question.

Financial Data (JSON):
${JSON.stringify(context, null, 2)}

User Question: "${userMessage}"

Instructions:
- Analyze the spending patterns from the JSON data
- Give specific, actionable advice based on actual spending
- If user spends a lot on fuel (Гориво), suggest public transport, carpooling, or walking
- If user spends a lot on food (Храна), suggest meal planning, cooking at home, or finding cheaper stores
- Answer questions about income, expenses, categories, or savings
- Be specific with numbers from their data
- Respond in Bulgarian
- Be concise and practical

Response:`;

  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.7,
          return_full_text: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    let responseText = '';
    if (Array.isArray(response.data)) {
      const first = response.data[0];
      if (first && typeof first.generated_text === 'string') {
        responseText = first.generated_text.trim();
      }
    } else if (response.data && typeof response.data.generated_text === 'string') {
      responseText = response.data.generated_text.trim();
    }

    if (!responseText) {
      return {
        success: false,
        error: 'AI did not return a response'
      };
    }

    return {
      success: true,
      response: responseText,
      context: context
    };
  } catch (error) {
    if (error.response && error.response.status === 503) {
      return {
        success: false,
        error: 'AI model is loading. Please try again in a moment.'
      };
    }
    return {
      success: false,
      error: error.message || 'AI request failed'
    };
  }
};

module.exports = {
  chatWithAI,
  getFinancialContext
};

