const axios = require('axios');
const { FinancialTransaction, FinancialCategory, FinancialGoal, ReceiptProduct } = require('../../models');
const { Op } = require('sequelize');
const { createTransaction, deleteTransaction, getTransactions } = require('./transactionService');
const { categorizeTransaction } = require('./transactionCategorizationService');
const { createGoal, updateGoal, deleteGoal, getGoals } = require('./goalService');

const getFinancialContext = async (userId, periodDays = 90) => {
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  startDate.setHours(0, 0, 0, 0);

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
    }, {
      model: ReceiptProduct,
      as: 'products',
      required: false,
      attributes: ['id', 'product_name', 'quantity', 'unit_price', 'total_price', 'category', 'subcategory']
    }],
    order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
    limit: 1000
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

  const recentTransactions = transactions.slice(0, 500).map(t => ({
    id: t.id,
    date: t.transaction_date ? new Date(t.transaction_date).toISOString().split('T')[0] : null,
    description: t.description || '',
    amount: Math.abs(parseFloat(t.amount || 0)),
    amountString: `${Math.abs(parseFloat(t.amount || 0)).toFixed(2)} €`,
    type: t.type,
    category: t.category?.name || 'Unknown',
    source: t.source || null,
    products: t.products && t.products.length > 0 ? t.products.map(p => ({
      name: p.product_name || '',
      quantity: parseFloat(p.quantity || 0),
      price: parseFloat(p.total_price || 0),
      category: p.category || null
    })) : []
  }));

  const goals = await FinancialGoal.findAll({
    where: {
      user_id: userId,
      is_achieved: false
    },
    order: [['created_at', 'DESC']],
    limit: 50
  });

  const goalsData = goals.map(g => ({
    id: g.id,
    title: g.title,
    description: g.description || '',
    target_amount: parseFloat(g.target_amount || 0),
    current_amount: parseFloat(g.current_amount || 0),
    progress: g.target_amount > 0 ? (parseFloat(g.current_amount || 0) / parseFloat(g.target_amount || 0)) * 100 : 0,
    target_date: g.target_date ? new Date(g.target_date).toISOString().split('T')[0] : null,
    goal_type: g.goal_type
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
    recentTransactions: recentTransactions,
    goals: goalsData
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
        transactionId: previousActionData.transactionId,
        amount: previousActionData.amount,
        date: previousActionData.date,
        descriptionKeywords: previousActionData.descriptionKeywords
      };
    }
  }
  
  if ((previousAction === 'show_last_transaction' || previousAction === 'delete_specific') && previousActionData && previousActionData.lastTransaction) {
    const isDeleteCommand = msgLower.includes('изтрий') || msgLower.includes('изтрии') || msgLower.includes('delete');
    if (isDeleteCommand) {
      const lastTrans = previousActionData.lastTransaction;
      let amount = null;
      if (lastTrans.amount) {
        if (typeof lastTrans.amount === 'number') {
          amount = lastTrans.amount;
        } else {
          amount = parseFloat(String(lastTrans.amount).replace(/[€\s]/g, ''));
        }
      }
      
      return {
        action: 'delete_specific',
        confirmed: true,
        transactionId: lastTrans.id || null,
        amount: amount,
        date: lastTrans.date || null,
        descriptionKeywords: lastTrans.description || null
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
    
    const isDeleteIt = (msgLower === 'изтрий я' || msgLower === 'изтрии я' || msgLower === 'изтрий' || msgLower === 'изтрии' || msgLower === 'delete it' || msgLower === 'delete' || msgLower.trim() === 'изтрий я' || msgLower.trim() === 'изтрии я' || (msgLower.includes('изтрий') && (msgLower.includes('я') || msgLower.length <= 10)) || (msgLower.includes('изтрии') && (msgLower.includes('я') || msgLower.length <= 10)));
    
    if (isDeleteIt && previousActionData && previousActionData.lastTransaction) {
      const lastTrans = previousActionData.lastTransaction;
      let amount = null;
      if (lastTrans.amount) {
        if (typeof lastTrans.amount === 'number') {
          amount = lastTrans.amount;
        } else {
          amount = parseFloat(String(lastTrans.amount).replace(/[€\s]/g, ''));
        }
      }
      
      return {
        action: 'delete_specific',
        confirmed: true,
        transactionId: lastTrans.id || null,
        amount: amount,
        date: lastTrans.date || null,
        descriptionKeywords: lastTrans.description || null
      };
    }
    
    const amountMatch = message.match(/(\d+[.,]\d+|\d+)\s*(€|лв|eur|bgn)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
    
    const dateMatch = message.match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/);
    const dateStr = dateMatch ? dateMatch[1] : null;
    
    const descriptionKeywords = [];
    const commonWords = ['изтрий', 'изтрии', 'delete', 'транзакция', 'transaction', 'за', 'for', 'с', 'with', '€', 'лв', 'eur', 'bgn', 'я', 'it'];
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
  
  const isGoal = msgLower.includes('цел') || msgLower.includes('goal') || msgLower.includes('спестяване') || msgLower.includes('savings');
  const isDeleteGoal = (msgLower.includes('изтрий') || msgLower.includes('изтрии') || msgLower.includes('delete')) && isGoal;
  
  if (isDeleteGoal) {
    const goalKeywords = [];
    const goalStopWords = ['изтрий', 'изтрии', 'delete', 'цел', 'goal', 'цели', 'goals'];
    const goalWords = message.split(/\s+/).filter(w => {
      const wLower = w.toLowerCase().trim();
      return w && !goalStopWords.some(sw => wLower.includes(sw)) && !w.match(/^\d+[.,]?\d*$/);
    });
    if (goalWords.length > 0) {
      goalKeywords.push(...goalWords.slice(0, 3));
    }
    
    return {
      action: 'delete_goal',
      goalKeywords: goalKeywords.length > 0 ? goalKeywords.join(' ') : null
    };
  }
  
  if (msgLower.includes('добави') || msgLower.includes('add') || msgLower.includes('създай') || msgLower.includes('create') || msgLower.includes('направи')) {
    const amountMatch = normalizedMessage.match(/(\d+[.,]\d+|\d+)\s*(€|лв|eur|bgn|евро|лева|лева)?/i);
    let amount = null;
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(',', '.'));
      if (amountMatch[2] && (amountMatch[2].toLowerCase().includes('лв') || amountMatch[2].toLowerCase().includes('bgn') || amountMatch[2].toLowerCase().includes('лева'))) {
        amount = amount / 1.95583;
      }
    }
    if (!amount || amount <= 0) {
      const numberMatch = normalizedMessage.match(/\d+[.,]?\d*/);
      if (numberMatch) {
        amount = parseFloat(numberMatch[0].replace(',', '.'));
      }
    }
    
    if (isGoal && amount && amount > 0) {
      const goalTitleWords = [];
      const goalStopWords = ['добави', 'add', 'създай', 'create', 'направи', 'цел', 'goal', 'за', 'for', '€', 'лв', 'eur', 'bgn', 'евро', 'лева'];
      const goalWords = message.split(/\s+/).filter(w => {
        const wLower = w.toLowerCase().trim();
        return w && !goalStopWords.some(sw => wLower.includes(sw)) && !w.match(/^\d+[.,]?\d*$/);
      });
      if (goalWords.length > 0) {
        goalTitleWords.push(...goalWords.slice(0, 10));
      }
      
      const goalType = msgLower.includes('спестяване') || msgLower.includes('savings') ? 'savings' : 
                      msgLower.includes('дълг') || msgLower.includes('debt') ? 'debt_payoff' :
                      msgLower.includes('инвестиция') || msgLower.includes('investment') ? 'investment' : 'purchase';
      
      return {
        action: 'create_goal',
        target_amount: amount,
        title: goalTitleWords.length > 0 ? goalTitleWords.join(' ') : null,
        goal_type: goalType
      };
    }
    
    const isExpense = msgLower.includes('разход') || msgLower.includes('expense') || msgLower.includes('харча') || msgLower.includes('плащам') || msgLower.includes('купувам') || msgLower.includes('храна') || msgLower.includes('billa') || msgLower.includes('lidl') || msgLower.includes('кауфланд');
    const isIncome = msgLower.includes('приход') || msgLower.includes('income') || msgLower.includes('получавам') || msgLower.includes('внасям') || msgLower.includes('заплата');
    
    let type = null;
    if (isIncome) {
      type = 'income';
    } else if (isExpense) {
      type = 'expense';
    } else {
      type = 'expense';
    }
    
    let description = '';
    const stopWords = ['добави', 'add', 'създай', 'create', 'направи', 'транзакция', 'transaction', 'за', 'for', 'от', 'from', '€', 'лв', 'eur', 'bgn', 'евро', 'лева', 'разход', 'expense', 'приход', 'income'];
    const words = message.split(/\s+/).filter(w => {
      const wLower = w.toLowerCase().trim();
      return w && !stopWords.some(sw => wLower.includes(sw)) && !w.match(/^\d+[.,]?\d*$/);
    });
    
    if (words.length > 0) {
      description = words.join(' ');
    }
    
    if (!amount || amount <= 0) {
      const numberMatch = message.match(/\d+/);
      if (numberMatch) {
        amount = parseFloat(numberMatch[0]);
      }
    }
    
    if (amount && amount > 0) {
      return {
        action: 'create',
        amount,
        type,
        description: description || null
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
        error: 'Моля посочете валидна сума за транзакцията.'
      };
    }
    
    if (!actionData.type) {
      actionData.type = 'expense';
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
      if (actionData.transactionId) {
        const transaction = await FinancialTransaction.findOne({
          where: {
            id: actionData.transactionId,
            user_id: userId
          }
        });
        
        if (!transaction) {
          return {
            success: false,
            error: 'Транзакцията не е намерена.'
          };
        }
        
        await transaction.destroy();
        
        return {
          success: true,
          action: 'delete_specific',
          message: `Успешно изтрита транзакция: ${transaction.description || 'Без описание'}`,
          deletedCount: 1
        };
      }
      
      const where = { user_id: userId };
      
      if (actionData.amount) {
        where.amount = {
          [Op.between]: [actionData.amount * 0.99, actionData.amount * 1.01]
        };
      }
      
      if (actionData.date) {
        let targetDate;
        if (actionData.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          targetDate = new Date(actionData.date);
        } else {
          const dateParts = actionData.date.split(/[.\/]/);
          if (dateParts.length === 3) {
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]);
            const year = parseInt(dateParts[2]) < 100 ? 2000 + parseInt(dateParts[2]) : parseInt(dateParts[2]);
            targetDate = new Date(year, month - 1, day);
          }
        }
        if (targetDate) {
          where.transaction_date = {
            [Op.gte]: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
            [Op.lt]: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
          };
        }
      }
      
      if (actionData.descriptionKeywords) {
        const keywords = actionData.descriptionKeywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        if (keywords.length > 0) {
          where.description = {
            [Op.or]: keywords.map(keyword => ({
              [Op.like]: `%${keyword}%`
            }))
          };
        }
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
  
  if (actionData.action === 'create_goal') {
    try {
      if (!actionData.target_amount || actionData.target_amount <= 0) {
        return {
          success: false,
          error: 'Моля посочете валидна целева сума за целта.'
        };
      }
      
      const goalData = {
        title: actionData.title || 'Нова цел',
        target_amount: actionData.target_amount,
        goal_type: actionData.goal_type || 'savings',
        current_amount: 0.00
      };
      
      const result = await createGoal(userId, goalData);
      
      if (result.success) {
        return {
          success: true,
          action: 'create_goal',
          message: `Успешно създадена цел: ${goalData.title} (${goalData.target_amount} €)`,
          goal: result.goal
        };
      } else {
        return {
          success: false,
          error: 'Грешка при създаване на цел: ' + result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Грешка при създаване на цел: ' + error.message
      };
    }
  }
  
  if (actionData.action === 'delete_goal') {
    try {
      const goalsResult = await getGoals(userId, { is_achieved: false });
      
      if (!goalsResult.success || !goalsResult.goals || goalsResult.goals.length === 0) {
        return {
          success: false,
          error: 'Няма налични цели за изтриване.'
        };
      }
      
      let goalToDelete = null;
      if (actionData.goalKeywords) {
        const keywords = actionData.goalKeywords.toLowerCase().split(/\s+/);
        goalToDelete = goalsResult.goals.find(g => {
          const title = (g.title || '').toLowerCase();
          return keywords.some(keyword => title.includes(keyword));
        });
      }
      
      if (!goalToDelete && goalsResult.goals.length === 1) {
        goalToDelete = goalsResult.goals[0];
      }
      
      if (!goalToDelete) {
        return {
          success: false,
          error: 'Моля уточнете коя цел искате да изтриете.'
        };
      }
      
      const result = await deleteGoal(goalToDelete.id, userId);
      
      if (result.success) {
        return {
          success: true,
          action: 'delete_goal',
          message: `Успешно изтрита цел: ${goalToDelete.title}`,
          deletedGoal: goalToDelete
        };
      } else {
        return {
          success: false,
          error: 'Грешка при изтриване на цел: ' + result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Грешка при изтриване на цел: ' + error.message
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
    totals: {
      income: context.totals.income.toFixed(2),
      expense: context.totals.expense.toFixed(2),
      balance: context.totals.balance.toFixed(2)
    },
    currentMonth: {
      income: context.currentMonth.income.toFixed(2),
      expense: context.currentMonth.expense.toFixed(2),
      balance: context.currentMonth.balance.toFixed(2)
    },
    topCategories: (context.topCategories || []).slice(0, 10).map(c => ({
      name: c.category,
      total: c.total.toFixed(2),
      percentage: c.percentage.toFixed(1)
    })),
    recentTransactions: context.recentTransactions.slice(0, 100).map(t => ({
      id: t.id,
      date: t.date,
      description: (t.description || '').substring(0, 80),
      amount: typeof t.amount === 'string' ? parseFloat(t.amount.replace(/[€\s]/g, '')) : (typeof t.amount === 'number' ? t.amount : 0),
      type: t.type,
      category: t.category
    })),
    goals: (context.goals || []).slice(0, 5)
  };

  const prompt = `Ти си финансов съветник. Анализирай данните и отговори на български.`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: defaultModel,
        messages: [
          {
            role: 'system',
            content: 'Ти си приятелски финансов съветник. Говориш с потребителя като с приятел - естествено, разговорно, но полезно. Отговаряй СТРОГО само с данни от предоставените транзакции. НИКОГА не измисляй или предполагай данни които не виждаш. КРИТИЧНО: recentTransactions е сортиран по дата DESCENDING (DESC) - най-новите са ПЪРВИ, най-старите са ПОСЛЕДНИ. recentTransactions[0] е ВИНАГИ най-новата/последната транзакция (най-новата дата). recentTransactions[recentTransactions.length - 1] е ВИНАГИ най-старата/първата транзакция (най-старата дата). Когато питат "най-първа" или "най-стара" - ВИНАГИ вземи последния елемент от масива. Отговори на български език.'
          },
          {
            role: 'user',
            content: `Финансови данни:\n${JSON.stringify(financialData)}\n\nВъпрос: "${userMessage}"\n\nПРАВИЛА:
1. НИКОГА НЕ ИЗМИСЛЯЙ ДАННИ. Използвай САМО данните от financialData. recentTransactions е сортиран по дата DESCENDING (най-новите са ПЪРВИ). recentTransactions[0] е ВИНАГИ най-новата/последната транзакция. recentTransactions[recentTransactions.length - 1] е ВИНАГИ най-старата/първата транзакция.

2. ЗА СЪВЕТИ ЗА СПЕСТЯВАНЕ:
- ВИНАГИ първо провери topCategories масива - там са категориите подредени по total (най-големите разходи първи)
- Първата категория в topCategories е това за което харчиш НАЙ-МНОГО
- Използвай total и percentage от topCategories за да видиш колко харчиш за всяка категория
- Изчисли месечни разходи: ако total за категория е X и периодът е 90 дни, месечните разходи са приблизително (X / 90) * 30
- Дай КОНКРЕТНИ съвети с РЕАЛНИ числа базирани на topCategories:
  * Ако най-голямата категория е "Храна": "Харчиш [total] € за храна ([percentage]% от разходите). Можеш да спестиш като планираш ястията, готвиш вкъщи, купуваш от по-евтини магазини, избягваш ресторанти."
  * Ако най-голямата категория е "Гориво": "Харчиш [total] € за гориво ([percentage]% от разходите). Можеш да спестиш като използваш градски транспорт, споделяш пътувания, комбинираш задачи."
  * Ако най-голямата категория е друга: анализирай какво е и дай конкретни съвети за намаляване на разходите в тази категория
- Изчисли потенциални спестявания: "Ако намалиш разходите с 20-30%, ще спестиш [изчислена сума] € месечно"
- Предложи 3-5 конкретни, практически съвета базирани на най-големите разходи от topCategories

3. ЗА ВЪПРОСИ ЗА ТРАНЗАКЦИИ - КРИТИЧНО:
- recentTransactions е сортиран по дата DESCENDING - най-новите са ПЪРВИ, най-старите са ПОСЛЕДНИ
- "Последна/най-нова транзакция" = recentTransactions[0] (ПЪРВИЯТ ЕЛЕМЕНТ, индекс 0) - това е транзакцията с НАЙ-НОВА дата
- "Най-стара/първа/най-първа транзакция" = recentTransactions[recentTransactions.length - 1] (ПОСЛЕДНИЯТ ЕЛЕМЕНТ) - това е транзакцията с НАЙ-СТАРА дата
- Когато питат "най-първа", "най-стара", "първа транзакция", "стара транзакция" - ВИНАГИ вземи ПОСЛЕДНИЯТ елемент от масива: recentTransactions[recentTransactions.length - 1]
- Сравни датите в масива - най-старата дата е в последния елемент
- Кажи ТОЧНО: описание, сума, дата от данните. НЕ измисляй дати или транзакции.

4. Говори приятелски и естествено, но бъди конкретен с числата от данните. ВИНАГИ анализирай topCategories за да видиш за какво харчи най-много.`
          }
        ],
        temperature: 0.2,
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
        let lastTransaction = null;
        if (context.recentTransactions && context.recentTransactions.length > 0) {
          const firstTrans = context.recentTransactions[0];
          if (userMessage.toLowerCase().includes('последн') || userMessage.toLowerCase().includes('най-нов') || userMessage.toLowerCase().includes('last')) {
            lastTransaction = {
              id: firstTrans.id,
              date: firstTrans.date,
              description: firstTrans.description,
              amount: typeof firstTrans.amount === 'number' ? firstTrans.amount : (typeof firstTrans.amount === 'string' ? parseFloat(firstTrans.amount.replace(/[€\s]/g, '')) : 0),
              type: firstTrans.type,
              category: firstTrans.category
            };
          }
        }
        
        return {
          success: true,
          response: responseText,
          context: context,
          lastTransaction: lastTransaction
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
      
      if (status === 401 || status === 403) {
        return {
          success: false,
          error: 'Невалиден API ключ. Моля проверете GROQ_API_KEY в .env файла.'
        };
      }
      if (status === 429) {
        const retryAfter = error.response.headers['retry-after'] || error.response.headers['Retry-After'];
        const waitSeconds = retryAfter ? parseInt(retryAfter) : 2;
        
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        
        try {
          const retryResponse = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: defaultModel,
              messages: [
                {
                  role: 'system',
                  content: 'Ти си финансов съветник AI асистент. Отговаряй СТРОГО само с данни от предоставените транзакции. НИКОГА не измисляй или предполагай данни които не виждаш. Ако не намериш нещо, кажи "Не намерих такава транзакция". КРИТИЧНО: recentTransactions е сортиран по дата DESC (най-новите ПЪРВИ). За "последна/най-нова транзакция" ВИНАГИ вземи recentTransactions[0]. За "най-стара транзакция" вземи последния елемент от масива. Бъди краток и точен. Отговори на български език.'
                },
                {
                  role: 'user',
                  content: `Финансови данни:\n${JSON.stringify(financialData, null, 2)}\n\nВъпрос на потребителя: "${userMessage}"\n\nКРИТИЧНО ВАЖНИ ПРАВИЛА - СЛЕДВАЙ ГИ СТРОГО:
1. НИКОГА НЕ ИЗМИСЛЯЙ ДАННИ. Използвай САМО данните от списъка recentTransactions. Ако не виждаш нещо в данните, кажи "Не намерих такава транзакция" или "Не виждам такава транзакция в данните".

2. КРИТИЧНО ЗА ПОСЛЕДНА ТРАНЗАКЦИЯ: recentTransactions е масив сортиран по дата DESCENDING (DESC) - най-новите са ПЪРВИ. Значи recentTransactions[0] (ПЪРВИЯТ ЕЛЕМЕНТ, ИНДЕКС 0) Е ВИНАГИ НАЙ-НОВАТА/ПОСЛЕДНАТА ТРАНЗАКЦИЯ. Когато питат "последна", "най-нова", "последната транзакция" - ВИНАГИ вземи recentTransactions[0] и кажи точно неговото описание, сума и дата. За "най-стара транзакция" вземи recentTransactions[recentTransactions.length - 1]. НИКОГА не измисляй данни!

3. За търсене по дата - датите са във формат YYYY-MM-DD. "1.06.2026" = "2026-06-01". Търси точно в полето "date" на транзакциите.

4. За търсене по име/описание - търси точно думите от въпроса в полето "description" на транзакциите.

5. Когато отговаряш, винаги казвай ТОЧНО каквото виждаш в данните: описание, сума, дата. НЕ променяй, НЕ измисляй, НЕ предполагай.

6. Ако питат "изтрий я" или подобно, отговори че не можеш да изтриваш, но можеш да кажеш каква транзакция да изтрият (кажи точно данните от списъка).

7. Бъди краток - кажи само необходимото, без допълнителни обяснения.`
                }
              ],
              temperature: 0.2,
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

          if (retryResponse.data && retryResponse.data.choices && retryResponse.data.choices.length > 0) {
            const responseText = retryResponse.data.choices[0].message?.content?.trim() || '';
            
            if (responseText && responseText.length >= 10) {
              return {
                success: true,
                response: responseText,
                context: context
              };
            }
          }
        } catch (retryError) {
          // Retry failed, continue to return error
        }
        
        return {
          success: false,
          error: 'Твърде много заявки към AI услугата. Моля изчакайте няколко секунди преди да опитате отново.'
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


