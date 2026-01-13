const axios = require('axios');

const generateProfessionalReportAnalysis = async (reportData, options = {}) => {
  try {
    const groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY;
    const groqModel = options.groqModel || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!groqApiKey) {
      return {
        success: false,
        error: 'Groq API key not configured'
      };
    }

    const summary = reportData.summary || {};
    const topCategories = reportData.top_categories || [];
    const insights = reportData.insights || {};
    const period = reportData.period || {};

    const analysisPrompt = `Ти си професионален финансов анализатор. Анализирай тези финансови данни и създай детайлен професионален отчет на български език.

ПЕРИОД: ${period.date_from || 'Неопределен'} до ${period.date_to || 'Неопределен'}

ОБЩА СУМАРИЗАЦИЯ:
- Общо приходи: ${(summary.total_income || 0).toFixed(2)} €
- Общо разходи: ${(summary.total_spent || 0).toFixed(2)} €
- Баланс: ${(summary.balance || 0).toFixed(2)} €
- Брой транзакции: ${summary.transaction_count || 0}
- Средна транзакция: ${(summary.average_transaction || 0).toFixed(2)} €

ТОП КАТЕГОРИИ РАЗХОДИ:
${topCategories.length > 0 ? topCategories.map((cat, i) => `${i + 1}. ${cat.category_name}: ${cat.total.toFixed(2)} € (${cat.percentage.toFixed(1)}% от общите разходи, ${cat.count} транзакции)`).join('\n') : 'Няма данни'}

КЛЮЧОВИ ИНСАЙТИ:
${insights.highest_spending_day ? `- Най-висок разход ден: ${insights.highest_spending_day.date} - ${insights.highest_spending_day.amount.toFixed(2)} €\n` : ''}${insights.largest_transaction ? `- Най-голяма транзакция: ${insights.largest_transaction.description} - ${insights.largest_transaction.amount.toFixed(2)} €\n` : ''}${insights.most_frequent_category ? `- Най-честа категория: ${insights.most_frequent_category.category_name} (${insights.most_frequent_category.count} транзакции)\n` : ''}

ИНСТРУКЦИИ ЗА АНАЛИЗ:
1. Направи професионален финансов анализ на данните
2. Идентифицирай основните трендове в разходите
3. Анализирай структурата на разходите по категории
4. Оцени финансовото здраве (баланс, разходи спрямо приходи)
5. Идентифицирай потенциални проблемни области (високи разходи, чести транзакции)
6. Давай конкретни наблюдения базирани на числата
7. Предложи конкретни действия за оптимизация на разходите
8. Ако има данни за най-висок разход ден, анализирай защо
9. Ако има доминираща категория, коментирай значението
10. Бъди професионален, обективен и конкретен

ФОРМАТ НА ОТЧЕТА:
Отговори с структуриран професионален финансов отчет на български език, който включва:
- Екзекютивна сумаризация (кратко резюме на основните находки)
- Анализ на разходите (детайлен анализ на категориите и трендовете)
- Финансови показатели (баланс, средни разходи, ефективност)
- Ключови наблюдения (важни находки от данните)
- Препоръки (конкретни действия за подобряване)

Бъди професионален, използвай финансови термини, и давай конкретни числа и проценти.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: groqModel,
        messages: [
          {
            role: 'system',
            content: 'Ти си професионален финансов анализатор с опит в корпоративни финанси, лични финанси и финансово планиране. Създаваш детайлни, обективни финансови отчети базирани на реални данни. Винаги използваш конкретни числа, проценти и фактологични наблюдения. Отговори на български език.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message?.content?.trim() || '';
      if (content) {
        return {
          success: true,
          analysis: content,
          source: 'ai'
        };
      }
    }

    return {
      success: false,
      error: 'Failed to generate analysis'
    };
  } catch (error) {
    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      };
    }
    return {
      success: false,
      error: error.message || 'Failed to generate analysis'
    };
  }
};

module.exports = {
  generateProfessionalReportAnalysis
};

