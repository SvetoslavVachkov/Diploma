const axios = require('axios');
const { FinancialTransaction, FinancialCategory } = require('../../models');
const { Op } = require('sequelize');
const { createTransaction, deleteTransaction, getTransactions } = require('./transactionService');
const { categorizeTransaction } = require('./transactionCategorizationService');

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

  const totalIncome = income.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
  const totalExpense = expenses.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const byCategory = {};
  expenses.forEach(t => {
    const catName = t.category?.name || 'Unknown';
    if (!byCategory[catName]) {
      byCategory[catName] = { total: 0, count: 0, transactions: [] };
    }
    const amount = Math.abs(parseFloat(t.amount));
    byCategory[catName].total += amount;
    byCategory[catName].count += 1;
    byCategory[catName].transactions.push({
      date: t.transaction_date,
      amount: amount,
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
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const monthExpense = expenses
    .filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd;
    })
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const recentTransactions = transactions.slice(0, 50).map(t => ({
    date: t.transaction_date,
    description: t.description || '',
    amount: `${Math.abs(parseFloat(t.amount)).toFixed(2)} €`,
    type: t.type,
    category: t.category?.name || 'Unknown'
  }));

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
    },
    recentTransactions: recentTransactions
  };
};

const parseActionCommand = (message, previousAction = null, previousActionData = null) => {
  const msgLower = message.toLowerCase().trim();
  
  if (previousAction && (msgLower === 'да' || msgLower === 'yes' || msgLower === 'потвърди' || msgLower.includes('потвърждавам') || msgLower === 'ok' || msgLower === 'ок')) {
    if (previousAction === 'delete_all') {
      return { action: 'delete_all', confirmed: true };
    }
    if (previousAction === 'delete_specific' && previousActionData) {
      return { 
        action: 'delete_specific', 
        confirmed: true,
        amount: previousActionData.amount,
        date: previousActionData.date,
        descriptionKeywords: previousActionData.descriptionKeywords
      };
    }
  }
  
  if (msgLower === 'да' || msgLower === 'yes' || msgLower === 'потвърди' || msgLower.includes('потвърждавам')) {
    if (msgLower.includes('изтрий') || msgLower.includes('изтрии') || msgLower.includes('delete')) {
      return { action: 'delete_all', confirmed: true };
    }
  }
  
  if (msgLower.includes('изтрий') || msgLower.includes('изтрии') || msgLower.includes('delete')) {
    if (msgLower.includes('всички') || msgLower.includes('all') || msgLower.includes('всички транзакции')) {
      const confirmed = msgLower.includes('да') || msgLower.includes('yes') || msgLower.includes('потвърди') || msgLower.includes('потвърждавам') || msgLower.includes('ok');
      return { action: 'delete_all', confirmed: confirmed };
    }
    
    const amountMatch = message.match(/(\d+[.,]\d+|\d+)\s*(€|лв|eur|bgn)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
    
    const dateMatch = message.match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/);
    const dateStr = dateMatch ? dateMatch[1] : null;
    
    const descriptionKeywords = [];
    const commonWords = ['изтрий', 'изтрии', 'delete', 'транзакция', 'transaction', 'за', 'for', 'с', 'with', '€', 'лв', 'eur', 'bgn'];
    const words = message.split(/\s+/).filter(w => w && !commonWords.some(cw => w.toLowerCase().includes(cw.toLowerCase())) && !w.match(/^\d+[.,]?\d*$/));
    if (words.length > 0) {
      descriptionKeywords.push(...words.slice(0, 5));
    }
    
    if (amount || dateStr || descriptionKeywords.length > 0) {
      return {
        action: 'delete_specific',
        confirmed: msgLower.includes('да') || msgLower.includes('yes') || msgLower.includes('потвърди') || msgLower.includes('потвърждавам') || msgLower.includes('ok'),
        amount,
        date: dateStr,
        descriptionKeywords: descriptionKeywords.length > 0 ? descriptionKeywords.join(' ') : null
      };
    }
    
    if (msgLower.includes('транзакции') || msgLower.includes('transactions')) {
      const confirmed = msgLower.includes('да') || msgLower.includes('yes') || msgLower.includes('потвърди') || msgLower.includes('потвърждавам') || msgLower.includes('ok');
      return { action: 'delete_all', confirmed: confirmed };
    }
  }
  
  if (msgLower.includes('добави') || msgLower.includes('add') || msgLower.includes('създай') || msgLower.includes('create')) {
    if (msgLower.includes('транзакция') || msgLower.includes('transaction')) {
      const amountMatch = message.match(/(\d+[.,]\d+|\d+)\s*(€|лв|eur|bgn)/i);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
      
      const isExpense = msgLower.includes('разход') || msgLower.includes('expense') || msgLower.includes('харча') || msgLower.includes('плащам');
      const isIncome = msgLower.includes('приход') || msgLower.includes('income') || msgLower.includes('получавам') || msgLower.includes('внасям');
      
      const type = isIncome ? 'income' : (isExpense ? 'expense' : null);
      
      const descriptionMatch = message.match(/(?:за|за|for|description|описание)[\s:]+([^0-9€]+)/i);
      const description = descriptionMatch ? descriptionMatch[1].trim() : null;
      
      return {
        action: 'create',
        amount,
        type,
        description
      };
    }
  }
  
  return null;
};

const executeAction = async (userId, actionData) => {
  if (actionData.action === 'delete_all') {
    if (!actionData.confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'Сигурни ли сте, че искате да изтриете ВСИЧКИ транзакции? Това действие не може да бъде отменено. Отговорете "да" или "потвърди" за да продължите.'
      };
    }
    
    try {
      const deleted = await FinancialTransaction.destroy({
        where: { user_id: userId }
      });
      
      return {
        success: true,
        action: 'delete_all',
        message: `Успешно изтрити ${deleted} транзакции.`,
        deletedCount: deleted
      };
    } catch (error) {
      return {
        success: false,
        error: 'Грешка при изтриване на транзакции: ' + error.message
      };
    }
  }
  
  if (actionData.action === 'create') {
    if (!actionData.amount || actionData.amount <= 0) {
      return {
        success: false,
        error: 'Моля посочете валидна сума за транзакцията. Например: "Добави транзакция 50 € за храна"'
      };
    }
    
    if (!actionData.type) {
      return {
        success: false,
        error: 'Моля посочете тип на транзакцията (приход или разход). Например: "Добави разход 50 € за храна"'
      };
    }
    
    try {
      const categories = await FinancialCategory.findAll({
        where: { type: actionData.type }
      });
      
      let categoryId = null;
      if (actionData.description) {
        const categorization = await categorizeTransaction(
          actionData.description,
          actionData.type,
          userId
        );
        
        if (categorization.success && categorization.result) {
          categoryId = categorization.result.categoryId;
        }
      }
      
      if (!categoryId && categories.length > 0) {
        categoryId = categories[0].id;
      }
      
      if (!categoryId) {
        return {
          success: false,
          error: 'Не можах да намеря подходяща категория. Моля създайте категория първо.'
        };
      }
      
      const transactionData = {
        category_id: categoryId,
        amount: actionData.amount,
        description: actionData.description || 'Добавена чрез AI',
        transaction_date: new Date().toISOString().split('T')[0],
        type: actionData.type
      };
      
      const result = await createTransaction(userId, transactionData);
      
      if (result.success) {
        return {
          success: true,
          action: 'create',
          message: `Успешно добавена транзакция: ${actionData.amount} € (${actionData.type === 'income' ? 'Приход' : 'Разход'})`,
          transaction: result.transaction
        };
      } else {
        return {
          success: false,
          error: 'Грешка при създаване на транзакция: ' + result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Грешка при създаване на транзакция: ' + error.message
      };
    }
  }
  
  if (actionData.action === 'delete_specific') {
    try {
      const where = { user_id: userId };
      
      if (actionData.amount) {
        where.amount = {
          [Op.between]: [actionData.amount * 0.99, actionData.amount * 1.01]
        };
      }
      
      if (actionData.date) {
        const dateParts = actionData.date.split(/[.\/]/);
        if (dateParts.length === 3) {
          const day = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]);
          const year = parseInt(dateParts[2]) < 100 ? 2000 + parseInt(dateParts[2]) : parseInt(dateParts[2]);
          const targetDate = new Date(year, month - 1, day);
          where.transaction_date = {
            [Op.gte]: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
            [Op.lt]: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
          };
        }
      }
      
      if (actionData.descriptionKeywords) {
        const keywords = actionData.descriptionKeywords.toLowerCase().split(/\s+/);
        where.description = {
          [Op.or]: keywords.map(keyword => ({
            [Op.like]: `%${keyword}%`
          }))
        };
      }
      
      const transactionsToDelete = await FinancialTransaction.findAll({ where });
      
      if (transactionsToDelete.length === 0) {
        return {
          success: false,
          error: 'Не са намерени транзакции, които отговарят на зададените критерии.'
        };
      }
      
      const deleted = await FinancialTransaction.destroy({ where });
      
      return {
        success: true,
        action: 'delete_specific',
        message: `Успешно изтрити ${deleted} транзакции.`,
        deletedCount: deleted
      };
    } catch (error) {
      return {
        success: false,
        error: 'Грешка при изтриване на транзакции: ' + error.message
      };
    }
  }
  
  return {
    success: false,
    error: 'Неразпознато действие'
  };
};

const chatWithAI = async (userId, userMessage, apiKey, model, previousAction = null, previousActionData = null) => {
  if (!apiKey) {
    return {
      success: false,
      error: 'AI не е конфигуриран. Добавете GROQ_API_KEY в .env файла.'
    };
  }

  const actionCommand = parseActionCommand(userMessage, previousAction, previousActionData);
  if (actionCommand) {
    const actionResult = await executeAction(userId, actionCommand);
    
    if (actionResult.requiresConfirmation) {
      return {
        success: true,
        response: actionResult.message,
        requiresConfirmation: true,
        action: actionCommand.action,
        actionData: actionResult.criteria || actionCommand
      };
    }
    
    if (actionResult.success) {
      return {
        success: true,
        response: actionResult.message,
        action: actionResult.action,
        data: actionResult.transaction || { deletedCount: actionResult.deletedCount }
      };
    } else {
      return {
        success: false,
        error: actionResult.error
      };
    }
  }

  const context = await getFinancialContext(userId, 90);
  
  const defaultModel = model || 'llama-3.1-8b-instant';

  const financialData = {
    period: `${context.period.days} дни`,
    totals: {
      income: `${context.totals.income.toFixed(2)} €`,
      expense: `${context.totals.expense.toFixed(2)} €`,
      balance: `${context.totals.balance.toFixed(2)} €`
    },
    currentMonth: {
      income: `${context.currentMonth.income.toFixed(2)} €`,
      expense: `${context.currentMonth.expense.toFixed(2)} €`,
      balance: `${context.currentMonth.balance.toFixed(2)} €`
    },
    topCategories: context.topCategories.map(c => ({
      name: c.category,
      total: `${c.total.toFixed(2)} €`,
      percentage: `${c.percentage.toFixed(1)}%`,
      average: `${c.average.toFixed(2)} €`
    })),
    recentTransactions: context.recentTransactions
  };

  const prompt = `Ти си финансов съветник AI асистент. Анализирай финансовите данни и отговори на въпроса на потребителя.

Финансови данни (JSON):
${JSON.stringify(financialData, null, 2)}

Въпрос на потребителя: "${userMessage}"

Инструкции:
- Анализирай разходните модели от данните
- Дай конкретни, практически съвети базирани на реални разходи
- Ако потребителят харчи много за "Гориво", предложи градски транспорт, споделено пътуване или ходене
- Ако потребителят харчи много за "Храна", предложи планиране на ястия, готвене вкъщи или по-евтини магазини
- Отговори на въпроси за приходи, разходи, категории или спестявания
- Бъди конкретен с числата от данните
- Отговори на български език
- Бъди краток и практичен
- Ако въпросът е приветствие, отговори приятелски и обясни как можеш да помогнеш

Отговор:`;

  try {
    console.log(`[AI Chat] Изпращам заявка до Groq API с модел: ${defaultModel}`);
    
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: defaultModel,
        messages: [
          {
            role: 'system',
            content: 'Ти си финансов съветник AI асистент. Отговаряй САМО на конкретния въпрос на потребителя. НЕ давай допълнителна информация, която не е запитана. Бъди краток и точен. Отговори на български език.'
          },
          {
            role: 'user',
            content: `Финансови данни:\n${JSON.stringify(financialData, null, 2)}\n\nВъпрос на потребителя: "${userMessage}"\n\nВАЖНО: Отговори САМО на конкретния въпрос. НЕ давай допълнителна информация, съвети или анализ, освен ако не са запитани. Ако питат за конкретна транзакция или търговец, провери в списъка с транзакции (recentTransactions).`
          }
        ],
        temperature: 0.7,
        max_tokens: 512
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const responseText = response.data.choices[0].message?.content?.trim() || '';
      
      if (responseText && responseText.length >= 10) {
        console.log(`[AI Chat] Успешен отговор от Groq API`);
        return {
          success: true,
          response: responseText,
          context: context
        };
      }
    }

    return {
      success: false,
      error: 'AI не върна валиден отговор. Моля опитайте отново.'
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorMsg = error.response.data?.error?.message || error.response.data?.message || '';
      console.log(`[AI Chat] Грешка от Groq API: ${status} - ${errorMsg}`);
      
      if (status === 401 || status === 403) {
        return {
          success: false,
          error: 'Невалиден API ключ. Моля проверете GROQ_API_KEY в .env файла.'
        };
      }
      if (status === 429) {
        return {
          success: false,
          error: 'Твърде много заявки. Моля изчакайте малко преди да опитате отново.'
        };
      }
      if (status === 503) {
        return {
          success: false,
          error: 'AI услугата е временно недостъпна. Моля опитайте отново след малко.'
        };
      }
    }
    
    return {
      success: false,
      error: 'AI заявката неуспешна: ' + (error.message || 'Неизвестна грешка')
    };
  }
};

const generateRuleBasedResponse = (userMessage, context) => {
  const messageLower = userMessage.toLowerCase().trim();
  
  if (messageLower === 'здрасти' || messageLower === 'здравей' || messageLower === 'здравейте' || messageLower === 'hi' || messageLower === 'hello') {
    return {
      success: true,
      response: `Здравейте! Аз съм вашият финансов съветник. Можете да ме питате за приходи, разходи, категории или съвети за спестяване. Например: "Колко харча за храна?" или "Какви са моите приходи този месец?"`,
      context: context
    };
  }
  
  const categoryKeywords = {
    'храна': ['храна', 'ядене', 'ресторант', 'кафе', 'магазин', 'billa', 'fantastico', 'lidl', 'kaufland'],
    'гориво': ['гориво', 'бензин', 'lukoil', 'shell', 'omv', 'пътуване', 'кола'],
    'транспорт': ['транспорт', 'градски', 'автобус', 'метро', 'такси'],
    'развлечения': ['развлечения', 'кино', 'театър', 'концерт', 'игри'],
    'здраве': ['здраве', 'лекар', 'аптека', 'лекарство', 'болница'],
    'образование': ['образование', 'училище', 'университет', 'курс', 'книга'],
    'други разходи': ['други', 'разно']
  };
  
  for (const [categoryName, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => messageLower.includes(keyword))) {
      const foundCategory = context.categories.find(c => 
        c.category.toLowerCase().includes(categoryName.toLowerCase()) ||
        categoryName.toLowerCase().includes(c.category.toLowerCase())
      );
      
      if (foundCategory) {
        return {
          success: true,
          response: `Харчите ${foundCategory.total.toFixed(2)} € за ${foundCategory.category} за последните ${context.period.days} дни. Това е ${foundCategory.percentage.toFixed(1)}% от общите ви разходи. Средно ${foundCategory.average.toFixed(2)} € на транзакция.`,
          context: context
        };
      }
    }
  }
  
  if (messageLower.includes('доход') || messageLower.includes('приход') || messageLower.includes('заплата')) {
    return {
      success: true,
      response: `Вашите приходи за текущия месец са ${context.currentMonth.income.toFixed(2)} €. Общо приходи за последните ${context.period.days} дни: ${context.totals.income.toFixed(2)} €.`,
      context: context
    };
  }
  
  if ((messageLower.includes('разход') || messageLower.includes('харча')) && !messageLower.includes('храна') && !messageLower.includes('гориво')) {
    return {
      success: true,
      response: `Вашите разходи за текущия месец са ${context.currentMonth.expense.toFixed(2)} €. Общо разходи за последните ${context.period.days} дни: ${context.totals.expense.toFixed(2)} €.`,
      context: context
    };
  }
  
  if (messageLower.includes('баланс')) {
    return {
      success: true,
      response: `Вашият баланс за текущия месец е ${context.currentMonth.balance.toFixed(2)} €. Общ баланс за последните ${context.period.days} дни: ${context.totals.balance.toFixed(2)} €.`,
      context: context
    };
  }
  
  if (messageLower.includes('категори') || messageLower.includes('харча най-много')) {
    const topCat = context.topCategories[0];
    if (topCat) {
      return {
        success: true,
        response: `Най-много харчите за ${topCat.category}: ${topCat.total.toFixed(2)} € (${topCat.percentage.toFixed(1)}% от общите разходи). Топ 3 категории: ${context.topCategories.slice(0, 3).map(c => `${c.category} ${c.total.toFixed(2)} €`).join(', ')}.`,
        context: context
      };
    }
  }
  
  if (messageLower.includes('спестяване') || messageLower.includes('спестя') || messageLower.includes('съвет')) {
    const tips = [];
    const topCat = context.topCategories[0];
    
    if (topCat && topCat.category === 'Гориво' && topCat.total > 50) {
      tips.push(`Харчите ${topCat.total.toFixed(2)} € за гориво. Помислете за градски транспорт, споделено пътуване или ходене на кратки разстояния.`);
    }
    
    if (topCat && topCat.category === 'Храна' && topCat.total > 100) {
      tips.push(`Харчите ${topCat.total.toFixed(2)} € за храна. Планирайте ястията, гответе вкъщи и търсете по-евтини магазини.`);
    }
    
    if (context.currentMonth.expense > context.currentMonth.income) {
      tips.push(`Разходите ви (${context.currentMonth.expense.toFixed(2)} €) надвишават приходите (${context.currentMonth.income.toFixed(2)} €). Намалете разходите в най-големите категории.`);
    }
    
    if (tips.length === 0) {
      tips.push(`Добре управлявате финансите си! Баланс: ${context.currentMonth.balance.toFixed(2)} €. Продължете да следете разходите.`);
    }
    
    return {
      success: true,
      response: tips.join(' '),
      context: context
    };
  }
  
  return {
    success: true,
    response: `За последните ${context.period.days} дни: Приходи ${context.totals.income.toFixed(2)} €, Разходи ${context.totals.expense.toFixed(2)} €, Баланс ${context.totals.balance.toFixed(2)} €. Топ категории: ${context.topCategories.slice(0, 3).map(c => `${c.category} ${c.total.toFixed(2)} €`).join(', ')}.`,
    context: context
  };
};

module.exports = {
  chatWithAI,
  getFinancialContext
};


