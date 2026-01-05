const { FinancialTransaction, FinancialCategory, Budget } = require('../../models');
const { Op } = require('sequelize');
const axios = require('axios');

const analyzeSpendingPatterns = async (userId, periodDays = 90) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const transactions = await FinancialTransaction.findAll({
      where: {
        user_id: userId,
        transaction_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        },
        type: 'expense'
      },
      include: [{
        model: FinancialCategory,
        as: 'category',
        attributes: ['id', 'name', 'type']
      }]
    });

    const categoryTotals = {};
    const monthlySpending = {};
    const averageDaily = {};

    transactions.forEach(t => {
      const catId = t.category_id;
      const catName = t.category.name;
      const amount = parseFloat(t.amount);
      const date = new Date(t.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!categoryTotals[catId]) {
        categoryTotals[catId] = {
          category_id: catId,
          category_name: catName,
          total: 0,
          count: 0,
          average: 0
        };
      }
      categoryTotals[catId].total += amount;
      categoryTotals[catId].count += 1;

      if (!monthlySpending[monthKey]) {
        monthlySpending[monthKey] = 0;
      }
      monthlySpending[monthKey] += amount;
    });

    Object.keys(categoryTotals).forEach(catId => {
      categoryTotals[catId].average = categoryTotals[catId].total / Math.max(categoryTotals[catId].count, 1);
    });

    const totalSpent = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const days = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const dailyAverage = totalSpent / days;

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

    const budgetStatus = [];
    for (const budget of budgets) {
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

      budgetStatus.push({
        category_id: budget.category_id,
        category_name: budget.category.name,
        budget_amount: parseFloat(budget.amount),
        spent_amount: parseFloat(spent),
        percentage: parseFloat(budget.amount) > 0 
          ? (parseFloat(spent) / parseFloat(budget.amount)) * 100 
          : 0,
        over_budget: parseFloat(spent) > parseFloat(budget.amount)
      });
    }

    return {
      success: true,
      data: {
        period_days: periodDays,
        total_spent: totalSpent,
        daily_average: dailyAverage,
        category_totals: Object.values(categoryTotals).sort((a, b) => b.total - a.total),
        monthly_spending: monthlySpending,
        budget_status: budgetStatus,
        transaction_count: transactions.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const generateAdviceWithAI = async (spendingData, options = {}) => {
  try {
    const hfApiKey = options.hfApiKey || process.env.HF_TXN_API_KEY;
    const hfModel = options.hfModel || process.env.HF_TXN_MODEL || 'facebook/bart-large-mnli';

    if (!hfApiKey) {
      return generateAdviceWithRules(spendingData);
    }

    const topCategories = spendingData.category_totals.slice(0, 5);
    const overBudgetCategories = spendingData.budget_status.filter(b => b.over_budget);
    
    const prompt = `Analyze this financial data and provide personalized money management advice:
Total spent: ${spendingData.total_spent.toFixed(2)} over ${spendingData.period_days} days
Daily average: ${spendingData.daily_average.toFixed(2)}
Top spending categories: ${topCategories.map(c => `${c.category_name}: ${c.total.toFixed(2)}`).join(', ')}
${overBudgetCategories.length > 0 ? `Over budget categories: ${overBudgetCategories.map(b => `${b.category_name} (${b.percentage.toFixed(0)}%)`).join(', ')}` : ''}

Provide 3-5 specific, actionable money-saving tips in Bulgarian. Focus on the highest spending categories and budget issues.`;

    try {
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${hfModel}`,
        {
          inputs: prompt,
          parameters: {
            max_length: 500,
            temperature: 0.7
          }
        },
        {
          headers: {
            Authorization: `Bearer ${hfApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      if (response.data && response.data[0] && response.data[0].generated_text) {
        const aiText = response.data[0].generated_text;
        const tips = extractTipsFromText(aiText);
        return {
          success: true,
          advice: tips,
          source: 'ai'
        };
      }
    } catch (error) {
    }

    return generateAdviceWithRules(spendingData);
  } catch (error) {
    return generateAdviceWithRules(spendingData);
  }
};

const extractTipsFromText = (text) => {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const tips = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 20 && (trimmed.match(/^\d+[\.\)]/) || trimmed.match(/^[-•]/) || trimmed.toLowerCase().includes('съвет') || trimmed.toLowerCase().includes('препоръка'))) {
      tips.push(trimmed.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, ''));
    }
  }

  if (tips.length === 0) {
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 30);
    tips.push(...sentences.slice(0, 5).map(s => s.trim()));
  }

  return tips.slice(0, 5);
};

const generateAdviceWithRules = (spendingData) => {
  const advice = [];
  const topCategories = spendingData.category_totals.slice(0, 3);
  const overBudget = spendingData.budget_status.filter(b => b.over_budget);

  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    advice.push(`Най-много харчите за ${topCategory.category_name} (${topCategory.total.toFixed(2)} лв). Прегледайте тези разходи и потърсете начини за оптимизация.`);
  }

  if (overBudget.length > 0) {
    overBudget.forEach(budget => {
      advice.push(`Превишихте бюджета за ${budget.category_name} с ${(budget.percentage - 100).toFixed(0)}%. Намалете разходите в тази категория.`);
    });
  }

  if (spendingData.daily_average > 50) {
    advice.push(`Средно харчите ${spendingData.daily_average.toFixed(2)} лв на ден. Задайте дневен лимит за разходи, за да контролирате по-добре финансите си.`);
  }

  if (topCategories.length > 1) {
    const secondCategory = topCategories[1];
    advice.push(`Втората ви най-голяма категория е ${secondCategory.category_name}. Сравнете цените и потърсете по-евтини алтернативи.`);
  }

  if (advice.length === 0) {
    advice.push('Добре управлявате финансите си! Продължете да следете разходите и да спазвате бюджетите.');
  }

  return {
    success: true,
    advice: advice.slice(0, 5),
    source: 'rules'
  };
};

const getMoneyAdvice = async (userId, options = {}) => {
  try {
    const periodDays = options.periodDays || 90;
    
    const spendingAnalysis = await analyzeSpendingPatterns(userId, periodDays);
    
    if (!spendingAnalysis.success) {
      return {
        success: false,
        error: spendingAnalysis.error
      };
    }

    const adviceResult = await generateAdviceWithAI(spendingAnalysis.data, {
      hfApiKey: process.env.HF_TXN_API_KEY,
      hfModel: process.env.HF_TXN_MODEL
    });

    return {
      success: true,
      advice: adviceResult.advice,
      source: adviceResult.source,
      spending_summary: {
        total_spent: spendingAnalysis.data.total_spent,
        daily_average: spendingAnalysis.data.daily_average,
        top_categories: spendingAnalysis.data.category_totals.slice(0, 3),
        over_budget_count: spendingAnalysis.data.budget_status.filter(b => b.over_budget).length
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
  getMoneyAdvice,
  analyzeSpendingPatterns,
  generateAdviceWithAI
};

