const { FinancialTransaction, FinancialCategory, Budget, ReceiptProduct } = require('../../models');
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
      }, {
        model: ReceiptProduct,
        as: 'products',
        required: false,
        attributes: ['id', 'product_name', 'quantity', 'unit_price', 'total_price', 'category', 'subcategory']
      }]
    });

    const categoryTotals = {};
    const monthlySpending = {};
    const productFrequency = {};

    transactions.forEach(t => {
      const catId = t.category_id;
      const catName = t.category?.name || 'Unknown';
      const amount = Math.abs(parseFloat(t.amount || 0));
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

      if (t.products && t.products.length > 0) {
        t.products.forEach(p => {
          const productName = p.product_name || '';
          if (productName) {
            if (!productFrequency[productName]) {
              productFrequency[productName] = {
                name: productName,
                count: 0,
                total: 0,
                category: p.category || null,
                subcategory: p.subcategory || null
              };
            }
            productFrequency[productName].count += parseFloat(p.quantity || 1);
            productFrequency[productName].total += Math.abs(parseFloat(p.total_price || 0));
          }
        });
      }
    });

    Object.keys(categoryTotals).forEach(catId => {
      categoryTotals[catId].average = categoryTotals[catId].total / Math.max(categoryTotals[catId].count, 1);
    });

    const totalSpent = transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
    const days = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const dailyAverage = totalSpent / days;

    const topProducts = Object.values(productFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

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
        transaction_count: transactions.length,
        top_products: topProducts
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
    const openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    const openaiModel = options.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!openaiApiKey) {
      return generateAdviceWithRules(spendingData);
    }

    const topProducts = (spendingData.top_products || []).slice(0, 15);
    
    const financialData = {
      period: {
        days: spendingData.period_days,
        total_spent: spendingData.total_spent,
        daily_average: spendingData.daily_average
      },
      categories: (spendingData.category_totals || []).map(c => ({
        name: c.category_name,
        total: c.total,
        count: c.count,
        average: c.average
      })),
      budgets: (spendingData.budget_status || []).map(b => ({
        category: b.category_name,
        budget: b.budget_amount,
        spent: b.spent_amount,
        percentage: b.percentage,
        over_budget: b.over_budget
      })),
      top_products: topProducts.map(p => ({
        name: p.name,
        count: p.count,
        total_spent: p.total,
        category: p.category,
        subcategory: p.subcategory
      }))
    };
    
    const prompt = `Ти си финансов анализатор. Анализирай тези финансови данни и дай обективни, конкретни наблюдения и съвети на български език.

Финансови данни:
Период: ${financialData.period.days} дни
Общо разходи: ${financialData.period.total_spent.toFixed(2)} €
Средно на ден: ${financialData.period.daily_average.toFixed(2)} €

Топ категории разходи:
${financialData.categories.length > 0 ? financialData.categories.map((c, i) => `${i + 1}. ${c.name}: ${c.total.toFixed(2)} € (${c.count} транзакции, средно ${c.average.toFixed(2)} €)`).join('\n') : 'Няма данни'}

${financialData.budgets.length > 0 ? `Бюджети:\n${financialData.budgets.map(b => `${b.category}: Бюджет ${b.budget.toFixed(2)} €, Разходи ${b.spent.toFixed(2)} € (${b.percentage.toFixed(1)}%)${b.over_budget ? ' - ПРЕВИШЕН' : ''}`).join('\n')}` : ''}

${topProducts.length > 0 ? `Най-често купувани продукти:\n${topProducts.map((p, i) => `${i + 1}. ${p.name}: ${p.count} броя, общо ${p.total_spent.toFixed(2)} €${p.category ? ` (${p.category}${p.subcategory ? ` - ${p.subcategory}` : ''})` : ''}`).join('\n')}` : ''}

Инструкции:
- Анализирай моделите на разходи и покупки от данните
- Кажи какво виждаш в данните - какви са основните разходи, какви продукти се купуват най-често
- Давай обективни наблюдения базирани на реалните данни (категории, продукти, суми)
- Ако виждаш често купувани продукти, коментирай трендовете
- Ако виждаш много разходи в определена категория, дай конкретни наблюдения
- Давай 3-5 конкретни наблюдения/съвета базирани на реалните данни
- Включвай конкретни суми, продукти, категории от данните
- Бъди обективен - кажи каквото виждаш в данните
- Отговори на български език
- Всеки съвет да бъде на отделен ред или маркиран с номер/тире`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: openaiModel,
          messages: [
            {
              role: 'system',
              content: 'Ти си финансов анализатор. Анализирай финансовите данни обективно и дай конкретни наблюдения за разходите, категориите и продуктите. Кажи каквото виждаш в данните - трендове, най-често купувани продукти, основни разходи. Бъди обективен и конкретен. Отговори на български език.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 600
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message?.content?.trim() || '';
        if (content) {
          const tips = extractTipsFromText(content);
          if (tips.length > 0) {
        return {
          success: true,
          advice: tips,
          source: 'ai'
        };
          }
        }
      }
    } catch (error) {
      if (error.response && (error.response.status === 410 || error.response.status === 404)) {
        return generateAdviceWithRules(spendingData);
      }
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

  const topProducts = spendingData.top_products || [];

  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    advice.push(`Най-много разходи в категория "${topCategory.category_name}" - ${topCategory.total.toFixed(2)} € (${topCategory.count} транзакции, средно ${topCategory.average.toFixed(2)} € на транзакция).`);
  }

  if (topProducts.length > 0) {
    const topProduct = topProducts[0];
    advice.push(`Най-често купуван продукт: "${topProduct.name}" - ${topProduct.count} броя за общо ${topProduct.total.toFixed(2)} €.`);
  }

  if (overBudget.length > 0) {
    overBudget.forEach(budget => {
      advice.push(`Бюджет за "${budget.category_name}" е превишен с ${(budget.percentage - 100).toFixed(0)}% (разходи: ${budget.spent_amount.toFixed(2)} €, бюджет: ${budget.budget_amount.toFixed(2)} €).`);
    });
  }

  if (topProducts.length > 1) {
    const secondProduct = topProducts[1];
    advice.push(`Вторият най-често купуван продукт е "${secondProduct.name}" - ${secondProduct.count} броя.`);
  }

  if (topCategories.length > 1) {
    const secondCategory = topCategories[1];
    advice.push(`Втора категория по разходи: "${secondCategory.category_name}" - ${secondCategory.total.toFixed(2)} €.`);
  }

  if (spendingData.daily_average > 0) {
    advice.push(`Средно ${spendingData.daily_average.toFixed(2)} € на ден за периода от ${spendingData.period_days} дни.`);
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
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
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

