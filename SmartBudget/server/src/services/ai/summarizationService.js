const axios = require('axios');
const crypto = require('crypto');
const { AICache } = require('../../models');

const CACHE_HOURS = 24;
const MAX_TEXT_LENGTH = 5000;

const generateCacheKey = (text, type) => {
  const hash = crypto.createHash('sha256').update(`${type}:${text}`).digest('hex');
  return `ai_summary_${hash}`;
};

const getCachedResult = async (cacheKey) => {
  try {
    const cached = await AICache.findOne({
      where: {
        cache_key: cacheKey,
        expires_at: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });

    if (cached) {
      return cached.result;
    }
  } catch (error) {
    console.error('Cache lookup error:', error.message);
  }
  return null;
};

const setCachedResult = async (cacheKey, result) => {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_HOURS);

    await AICache.upsert({
      cache_key: cacheKey,
      result,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('Cache store error:', error.message);
  }
};

const summarizeWithExtractive = (text, maxSentences = 3) => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length <= maxSentences) {
    return sentences.join('. ').trim() + '.';
  }

  const wordFreq = {};
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  
  words.forEach(word => {
    if (word.length > 3) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map(sentence => {
    const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
    let score = 0;
    
    sentenceWords.forEach(word => {
      if (wordFreq[word]) {
        score += wordFreq[word];
      }
    });
    
    return { sentence, score: score / sentenceWords.length };
  });

  sentenceScores.sort((a, b) => b.score - a.score);
  
  const topSentences = sentenceScores
    .slice(0, maxSentences)
    .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
    .map(s => s.sentence);

  return topSentences.join('. ').trim() + '.';
};

const summarizeWithAPI = async (text, apiUrl, apiKey) => {
  try {
    const response = await axios.post(
      apiUrl,
      {
        text: text.substring(0, MAX_TEXT_LENGTH),
        max_length: 150,
        min_length: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.summary) {
      return response.data.summary;
    }
  } catch (error) {
    console.error('API summarization error:', error.message);
    throw error;
  }
  return null;
};

const generateSummary = async (article, options = {}) => {
  const startTime = Date.now();
  const fullText = `${article.title}. ${article.content || article.excerpt || ''}`.trim();
  
  if (!fullText || fullText.length < 50) {
    return { success: false, error: 'Article text too short for summarization' };
  }

  const textToSummarize = fullText.substring(0, MAX_TEXT_LENGTH);
  const cacheKey = generateCacheKey(textToSummarize, 'summary');
  const cached = await getCachedResult(cacheKey);
  
  if (cached) {
    return { success: true, result: cached, fromCache: true };
  }

  try {
    let summary = null;

    if (options.summarizationApiUrl && options.summarizationApiKey) {
      try {
        summary = await summarizeWithAPI(textToSummarize, options.summarizationApiUrl, options.summarizationApiKey);
      } catch (error) {
        console.error('API summarization failed, falling back to extractive:', error.message);
      }
    }

    if (!summary) {
      summary = summarizeWithExtractive(textToSummarize, 3);
    }

    if (!summary || summary.length < 20) {
      summary = article.excerpt || article.content?.substring(0, 200) || article.title;
    }

    const result = {
      summary: summary.substring(0, 500),
      originalLength: fullText.length,
      summaryLength: summary.length,
      compressionRatio: Math.round((summary.length / fullText.length) * 100) / 100,
      model: options.summarizationApiUrl ? 'api' : 'extractive'
    };

    await setCachedResult(cacheKey, result);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      result,
      processingTime,
      fromCache: false
    };

  } catch (error) {
    console.error('Summarization error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateSummary
};

