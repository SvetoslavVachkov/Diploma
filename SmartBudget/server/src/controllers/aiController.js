const { NewsArticle, AIAnalysis } = require('../models');
const { processArticle, processUnprocessedArticles, reprocessArticle } = require('../services/ai/processingPipeline');
const { classifyArticle } = require('../services/ai/classificationService');
const { analyzeSentiment } = require('../services/ai/sentimentService');
const { generateSummary } = require('../services/ai/summarizationService');

const processArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    const result = await processArticle(id, { force });

    res.status(result.success ? 200 : 500).json({
      status: result.success ? 'success' : 'error',
      message: result.message || result.error,
      data: result.results || null,
      processingTime: result.processingTime
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to process article',
      error: error.message
    });
  }
};

const processBatch = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const batchSize = parseInt(req.query.batchSize) || 5;

    const result = await processUnprocessedArticles({ limit, batchSize });

    res.status(200).json({
      status: 'success',
      message: `Processed ${result.processed} articles`,
      data: {
        processed: result.processed,
        failed: result.failed,
        total: result.total
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to process articles',
      error: error.message
    });
  }
};

const getArticleAnalysis = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await NewsArticle.findByPk(id);
    
    if (!article) {
      return res.status(404).json({
        status: 'error',
        message: 'Article not found'
      });
    }

    const analyses = await AIAnalysis.findAll({
      where: { article_id: id },
      order: [['created_at', 'DESC']]
    });

    const grouped = {
      classification: analyses.find(a => a.analysis_type === 'classification'),
      sentiment: analyses.find(a => a.analysis_type === 'sentiment'),
      summary: analyses.find(a => a.analysis_type === 'summary'),
      keywords: analyses.filter(a => a.analysis_type === 'keywords')
    };

    res.status(200).json({
      status: 'success',
      data: {
        article: {
          id: article.id,
          title: article.title,
          is_processed: article.is_processed,
          is_ai_classified: article.is_ai_classified,
          is_ai_summarized: article.is_ai_summarized
        },
        analyses: grouped,
        allAnalyses: analyses
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch analysis',
      error: error.message
    });
  }
};

const classifyText = async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Text too short for classification'
      });
    }

    const result = await classifyArticle(
      { title: text, excerpt: '', content: '' },
      { uclassifyApiKey: process.env.UCLASSIFY_API_KEY }
    );

    res.status(result.success ? 200 : 500).json({
      status: result.success ? 'success' : 'error',
      data: result.result,
      fromCache: result.fromCache
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to classify text',
      error: error.message
    });
  }
};

const analyzeTextSentiment = async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Text too short for sentiment analysis'
      });
    }

    const result = await analyzeSentiment(
      { title: text, excerpt: '', content: '' },
      { uclassifyApiKey: process.env.UCLASSIFY_API_KEY }
    );

    res.status(result.success ? 200 : 500).json({
      status: result.success ? 'success' : 'error',
      data: result.result,
      fromCache: result.fromCache
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to analyze sentiment',
      error: error.message
    });
  }
};

const summarizeText = async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.length < 50) {
      return res.status(400).json({
        status: 'error',
        message: 'Text too short for summarization'
      });
    }

    const result = await generateSummary(
      { title: '', excerpt: '', content: text },
      {
        summarizationApiUrl: process.env.SUMMARIZATION_API_URL,
        summarizationApiKey: process.env.SUMMARIZATION_API_KEY
      }
    );

    res.status(result.success ? 200 : 500).json({
      status: result.success ? 'success' : 'error',
      data: result.result,
      fromCache: result.fromCache
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to summarize text',
      error: error.message
    });
  }
};

module.exports = {
  processArticleById,
  processBatch,
  getArticleAnalysis,
  classifyText,
  analyzeTextSentiment,
  summarizeText
};

