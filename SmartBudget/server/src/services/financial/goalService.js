const { FinancialGoal } = require('../../models');
const { Op } = require('sequelize');

const createGoal = async (userId, goalData) => {
  try {
    const targetAmount = Math.abs(parseFloat(goalData.target_amount));
    
    if (targetAmount <= 0) {
      throw new Error('Target amount must be greater than 0');
    }

    if (goalData.target_date) {
      const targetDate = new Date(goalData.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (targetDate < today) {
        throw new Error('Target date cannot be in the past');
      }
    }

    const goal = await FinancialGoal.create({
      user_id: userId,
      title: goalData.title,
      description: goalData.description || null,
      target_amount: targetAmount,
      current_amount: parseFloat(goalData.current_amount) || 0.00,
      target_date: goalData.target_date || null,
      goal_type: goalData.goal_type,
      is_achieved: false
    });

    return {
      success: true,
      goal: goal.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateGoal = async (goalId, userId, updateData) => {
  try {
    const goal = await FinancialGoal.findOne({
      where: { id: goalId, user_id: userId }
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    const updates = {};

    if (updateData.title !== undefined) {
      updates.title = updateData.title;
    }

    if (updateData.description !== undefined) {
      updates.description = updateData.description;
    }

    if (updateData.target_amount !== undefined) {
      const targetAmount = Math.abs(parseFloat(updateData.target_amount));
      if (targetAmount <= 0) {
        throw new Error('Target amount must be greater than 0');
      }
      updates.target_amount = targetAmount;
    }

    if (updateData.current_amount !== undefined) {
      updates.current_amount = Math.max(0, parseFloat(updateData.current_amount));
    }

    if (updateData.target_date !== undefined) {
      if (updateData.target_date) {
        const targetDate = new Date(updateData.target_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (targetDate < today) {
          throw new Error('Target date cannot be in the past');
        }
      }
      updates.target_date = updateData.target_date || null;
    }

    if (updateData.goal_type !== undefined) {
      updates.goal_type = updateData.goal_type;
    }

    if (updateData.is_achieved !== undefined) {
      updates.is_achieved = updateData.is_achieved;
    }

    await goal.update(updates);

    if (updates.current_amount !== undefined || updates.target_amount !== undefined) {
      const currentAmount = parseFloat(goal.current_amount);
      const targetAmount = parseFloat(goal.target_amount);
      
      if (currentAmount >= targetAmount && !goal.is_achieved) {
        await goal.update({ is_achieved: true });
      } else if (currentAmount < targetAmount && goal.is_achieved) {
        await goal.update({ is_achieved: false });
      }
    }

    await goal.reload();

    return {
      success: true,
      goal: goal.toJSON()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteGoal = async (goalId, userId) => {
  try {
    const goal = await FinancialGoal.findOne({
      where: { id: goalId, user_id: userId }
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    await goal.destroy();

    return {
      success: true,
      message: 'Goal deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getGoals = async (userId, filters = {}) => {
  try {
    const where = { user_id: userId };

    if (filters.is_achieved !== undefined) {
      where.is_achieved = filters.is_achieved === 'true' || filters.is_achieved === true;
    }

    if (filters.goal_type) {
      where.goal_type = filters.goal_type;
    }

    const goals = await FinancialGoal.findAll({
      where,
      order: [['created_at', 'DESC']]
    });

    return {
      success: true,
      goals: goals.map(goal => {
        const goalData = goal.toJSON();
        const currentAmount = parseFloat(goalData.current_amount);
        const targetAmount = parseFloat(goalData.target_amount);
        const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
        const remaining = Math.max(0, targetAmount - currentAmount);
        
        let daysRemaining = null;
        if (goalData.target_date) {
          const targetDate = new Date(goalData.target_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = targetDate - today;
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        return {
          ...goalData,
          progress: Math.min(100, Math.max(0, progress)),
          remaining,
          days_remaining: daysRemaining
        };
      })
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getGoalById = async (goalId, userId) => {
  try {
    const goal = await FinancialGoal.findOne({
      where: { id: goalId, user_id: userId }
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    const goalData = goal.toJSON();
    const currentAmount = parseFloat(goalData.current_amount);
    const targetAmount = parseFloat(goalData.target_amount);
    const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const remaining = Math.max(0, targetAmount - currentAmount);
    
    let daysRemaining = null;
    if (goalData.target_date) {
      const targetDate = new Date(goalData.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = targetDate - today;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      success: true,
      goal: {
        ...goalData,
        progress: Math.min(100, Math.max(0, progress)),
        remaining,
        days_remaining: daysRemaining
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const addToGoal = async (goalId, userId, amount) => {
  try {
    const goal = await FinancialGoal.findOne({
      where: { id: goalId, user_id: userId }
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    const addAmount = Math.abs(parseFloat(amount));
    const newCurrentAmount = parseFloat(goal.current_amount) + addAmount;
    const targetAmount = parseFloat(goal.target_amount);

    await goal.update({ current_amount: newCurrentAmount });

    if (newCurrentAmount >= targetAmount && !goal.is_achieved) {
      await goal.update({ is_achieved: true });
    }

    await goal.reload();

    const goalData = goal.toJSON();
    const currentAmount = parseFloat(goalData.current_amount);
    const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const remaining = Math.max(0, targetAmount - currentAmount);

    return {
      success: true,
      goal: {
        ...goalData,
        progress: Math.min(100, Math.max(0, progress)),
        remaining
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getGoalsSummary = async (userId) => {
  try {
    const goals = await FinancialGoal.findAll({
      where: { user_id: userId }
    });

    const totalGoals = goals.length;
    const achievedGoals = goals.filter(g => g.is_achieved).length;
    const activeGoals = totalGoals - achievedGoals;

    const totalTarget = goals.reduce((sum, g) => sum + parseFloat(g.target_amount), 0);
    const totalCurrent = goals.reduce((sum, g) => sum + parseFloat(g.current_amount), 0);
    const totalProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

    const goalsByType = {};
    goals.forEach(goal => {
      const type = goal.goal_type;
      if (!goalsByType[type]) {
        goalsByType[type] = {
          count: 0,
          total_target: 0,
          total_current: 0
        };
      }
      goalsByType[type].count++;
      goalsByType[type].total_target += parseFloat(goal.target_amount);
      goalsByType[type].total_current += parseFloat(goal.current_amount);
    });

    return {
      success: true,
      summary: {
        total_goals: totalGoals,
        achieved_goals: achievedGoals,
        active_goals: activeGoals,
        total_target: totalTarget,
        total_current: totalCurrent,
        total_progress: Math.min(100, Math.max(0, totalProgress)),
        by_type: goalsByType
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getGoalAdvice = async (userId) => {
  try {
    const { FinancialTransaction } = require('../../models');
    const { Op } = require('sequelize');
    
    const goals = await FinancialGoal.findAll({
      where: { user_id: userId }
    });

    if (goals.length === 0) {
      return {
        success: true,
        advice: []
      };
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const transactions = await FinancialTransaction.findAll({
      where: {
        user_id: userId,
        transaction_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      }
    });

    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const goalsData = goals.map(g => ({
      title: g.title,
      target_amount: parseFloat(g.target_amount),
      current_amount: parseFloat(g.current_amount),
      progress: parseFloat(g.target_amount) > 0 ? (parseFloat(g.current_amount) / parseFloat(g.target_amount)) * 100 : 0,
      goal_type: g.goal_type,
      target_date: g.target_date,
      is_achieved: g.is_achieved,
      remaining: Math.max(0, parseFloat(g.target_amount) - parseFloat(g.current_amount))
    }));

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!openaiApiKey) {
      return {
        success: true,
        advice: []
      };
    }

    try {
      const axios = require('axios');
      const prompt = `Ти си финансов съветник. Анализирай финансовите цели и транзакции на потребителя и дай конкретни съвети как да постигне целите си.

Финансови данни (последни 3 месеца):
- Приходи: ${totalIncome.toFixed(2)} лв
- Разходи: ${totalExpenses.toFixed(2)} лв
- Спестявания потенциал: ${(totalIncome - totalExpenses).toFixed(2)} лв

Финансови цели:
${goalsData.map((g, i) => `${i + 1}. ${g.title} (${g.goal_type}): ${g.current_amount.toFixed(2)} / ${g.target_amount.toFixed(2)} лв (${g.progress.toFixed(1)}%) - остава ${g.remaining.toFixed(2)} лв${g.target_date ? ` до ${new Date(g.target_date).toLocaleDateString('bg-BG')}` : ''}${g.is_achieved ? ' - ПОСТИГНАТА' : ''}`).join('\n')}

Давай 3-5 конкретни съвета на български език как потребителят може да постигне целите си:
- Анализирай прогреса по всяка цел
- Предложи стратегии за спестяване базирани на текущите разходи
- Давай практични съвети за всяка цел според типа й (спестяване, изплащане на дълг, инвестиция, покупка)
- Ако има недостигащи цели, предложи как да ускори напредъка
- Бъди конкретен с числа и дати
- Всеки съвет да бъде на отделен ред`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: openaiModel,
          messages: [
            {
              role: 'system',
              content: 'Ти си експертен финансов съветник. Давай практични, конкретни съвети за постигане на финансови цели базирани на реални данни.'
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
          const lines = content.split('\n').filter(l => l.trim().length > 20);
          const advice = lines.slice(0, 5).map(l => l.trim().replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, ''));
          
          if (advice.length > 0) {
            return {
              success: true,
              advice: advice
            };
          }
        }
      }
    } catch (error) {
    }

    return {
      success: true,
      advice: []
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createGoal,
  updateGoal,
  deleteGoal,
  getGoals,
  getGoalById,
  addToGoal,
  getGoalsSummary,
  getGoalAdvice
};

