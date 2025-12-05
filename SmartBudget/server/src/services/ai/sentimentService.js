const axios = require('axios');
const crypto = require('crypto');
const { AICache } = require('../../models');

const UCLASSIFY_API_URL = 'https://api.uclassify.com/v1';
const CACHE_HOURS = 24;

const generateCacheKey = (text, type) => {
  const hash = crypto.createHash('sha256').update(`${type}:${text}`).digest('hex');
  return `ai_sentiment_${hash}`;
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

const analyzeSentimentWithUClassify = async (text, apiKey) => {
  try {
    const response = await axios.post(
      `${UCLASSIFY_API_URL}/uClassify/Sentiment/classify`,
      { texts: [text] },
      {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data[0] && response.data[0].classification) {
      const classification = response.data[0].classification;
      const positive = classification.positive || 0;
      const negative = classification.negative || 0;
      const neutral = classification.neutral || 0;

      let sentiment = 'neutral';
      let score = 0;

      if (positive > negative && positive > neutral) {
        sentiment = 'positive';
        score = positive;
      } else if (negative > positive && negative > neutral) {
        sentiment = 'negative';
        score = negative;
      } else {
        sentiment = 'neutral';
        score = neutral;
      }

      return {
        sentiment,
        score: Math.round(score * 100) / 100,
        breakdown: {
          positive: Math.round(positive * 100) / 100,
          negative: Math.round(negative * 100) / 100,
          neutral: Math.round(neutral * 100) / 100
        }
      };
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Invalid uClassify API key');
    }
    throw error;
  }
  return null;
};

const analyzeSentimentWithKeywords = (text) => {
  const textLower = text.toLowerCase();
  
  const positiveKeywords = ['добър', 'отличен', 'успех', 'растеж', 'победа', 'напредък', 'положителен', 'добре', 'добре', 'радост'];
  const negativeKeywords = ['лош', 'проблем', 'криза', 'спад', 'загуба', 'негативен', 'трудно', 'риск', 'заплаха', 'страх'];

  let positiveCount = 0;
  let negativeCount = 0;

  positiveKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) {
      positiveCount++;
    }
  });

  negativeKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) {
      negativeCount++;
    }
  });

  let sentiment = 'neutral';
  let score = 0.5;

  if (positiveCount > negativeCount && positiveCount > 0) {
    sentiment = 'positive';
    score = Math.min(0.5 + (positiveCount * 0.1), 0.9);
  } else if (negativeCount > positiveCount && negativeCount > 0) {
    sentiment = 'negative';
    score = Math.min(0.5 + (negativeCount * 0.1), 0.9);
  }

  return {
    sentiment,
    score: Math.round(score * 100) / 100,
    breakdown: {
      positive: sentiment === 'positive' ? score : 0.33,
      negative: sentiment === 'negative' ? score : 0.33,
      neutral: sentiment === 'neutral' ? score : 0.34
    }
  };
};

const analyzeSentiment = async (article, options = {}) => {
  const startTime = Date.now();
  const text = `${article.title} ${article.excerpt || ''}`.trim();
  
  if (!text || text.length < 10) {
    return { success: false, error: 'Article text too short' };
  }

  const cacheKey = generateCacheKey(text, 'sentiment');
  const cached = await getCachedResult(cacheKey);
  
  if (cached) {
    return { success: true, result: cached, fromCache: true };
  }

  try {
    let sentimentResult = null;

    if (options.uclassifyApiKey) {
      try {
        sentimentResult = await analyzeSentimentWithUClassify(text, options.uclassifyApiKey);
      } catch (error) {
        console.error('uClassify sentiment analysis failed, falling back to keyword matching:', error.message);
      }
    }

    if (!sentimentResult) {
      sentimentResult = analyzeSentimentWithKeywords(text);
    }

    if (!sentimentResult) {
      return { success: false, error: 'Could not analyze sentiment' };
    }

    const result = {
      ...sentimentResult,
      model: options.uclassifyApiKey ? 'uclassify' : 'keyword-matching'
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
    console.error('Sentiment analysis error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  analyzeSentiment
};

