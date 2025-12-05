const { NewsArticle, AIAnalysis, SystemConfig } = require('../../models');
const { classifyArticle, assignCategoriesToArticle } = require('./classificationService');
const { analyzeSentiment } = require('./sentimentService');
const { generateSummary } = require('./summarizationService');

const getAIConfig = async () => {
  try {
    const config = await SystemConfig.findOne({
      where: { key: 'ai_model_config' }
    });

    if (config && config.value) {
      return config.value;
    }
  } catch (error) {
    console.error('Error loading AI config:', error.message);
  }

  return {
    default_model: 'keyword-matching',
    sentiment_model: 'keyword-matching',
    max_tokens: 512
  };
};

const processArticle = async (articleId, options = {}) => {
  const startTime = Date.now();

  try {
    const article = await NewsArticle.findByPk(articleId);
    
    if (!article) {
      return { success: false, error: 'Article not found' };
    }

    if (article.is_processed && !options.force) {
      return { success: true, message: 'Article already processed', skipped: true };
    }

    const aiConfig = await getAIConfig();
    const processingOptions = {
      uclassifyApiKey: options.uclassifyApiKey || process.env.UCLASSIFY_API_KEY,
      summarizationApiUrl: options.summarizationApiUrl || process.env.SUMMARIZATION_API_URL,
      summarizationApiKey: options.summarizationApiKey || process.env.SUMMARIZATION_API_KEY
    };

    const results = {
      classification: null,
      sentiment: null,
      summary: null,
      categoriesAssigned: 0
    };

    if (!article.is_ai_classified || options.force) {
      const classificationResult = await classifyArticle(article, processingOptions);
      
      if (classificationResult.success) {
        results.classification = classificationResult.result;
        
        const assignments = await assignCategoriesToArticle(articleId, classificationResult.result);
        results.categoriesAssigned = assignments.length;

        await AIAnalysis.create({
          article_id: articleId,
          analysis_type: 'classification',
          result: classificationResult.result,
          confidence_score: classificationResult.result.confidence,
          model_name: classificationResult.result.model,
          processing_time_ms: classificationResult.processingTime || 0
        });

        await article.update({ is_ai_classified: true });
      }
    }

    if (!article.is_ai_summarized || options.force) {
      const summaryResult = await generateSummary(article, processingOptions);
      
      if (summaryResult.success) {
        results.summary = summaryResult.result;

        await AIAnalysis.create({
          article_id: articleId,
          analysis_type: 'summary',
          result: summaryResult.result,
          confidence_score: 0.8,
          model_name: summaryResult.result.model,
          processing_time_ms: summaryResult.processingTime || 0
        });

        await article.update({ is_ai_summarized: true });
      }
    }

    const sentimentResult = await analyzeSentiment(article, processingOptions);
    
    if (sentimentResult.success) {
      results.sentiment = sentimentResult.result;

      await AIAnalysis.create({
        article_id: articleId,
        analysis_type: 'sentiment',
        result: sentimentResult.result,
        confidence_score: sentimentResult.result.score,
        model_name: sentimentResult.result.model,
        processing_time_ms: sentimentResult.processingTime || 0
      });
    }

    await article.update({ is_processed: true });

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      articleId,
      results,
      processingTime: totalTime
    };

  } catch (error) {
    console.error(`Error processing article ${articleId}:`, error.message);
    return {
      success: false,
      error: error.message,
      articleId
    };
  }
};

const processUnprocessedArticles = async (options = {}) => {
  const limit = options.limit || 10;
  const batchSize = options.batchSize || 5;

  try {
    const articles = await NewsArticle.findAll({
      where: {
        is_processed: false
      },
      order: [['created_at', 'DESC']],
      limit
    });

    if (articles.length === 0) {
      return {
        success: true,
        processed: 0,
        message: 'No unprocessed articles found'
      };
    }

    const results = [];
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(article => processArticle(article.id, options))
      );

      results.push(...batchResults);

      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.success && !r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: true,
      processed: successful,
      failed,
      total: articles.length,
      results
    };

  } catch (error) {
    console.error('Error processing unprocessed articles:', error);
    return {
      success: false,
      error: error.message,
      processed: 0
    };
  }
};

const reprocessArticle = async (articleId, options = {}) => {
  return await processArticle(articleId, { ...options, force: true });
};

module.exports = {
  processArticle,
  processUnprocessedArticles,
  reprocessArticle
};

