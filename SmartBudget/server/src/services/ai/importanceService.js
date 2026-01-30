const axios = require('axios');
const crypto = require('crypto');
const { AICache } = require('../../models');

const CACHE_HOURS = 24;

const generateCacheKey = (text) => {
  const hash = crypto.createHash('sha256').update(`importance:${text}`).digest('hex');
  return `news_importance_${hash}`;
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
  }
};

const scoreImportance = async (title, content, excerpt, apiKey, model) => {
  if (!apiKey || !model) {
    return { important: false, score: 0, reason: 'AI not configured' };
  }

  const text = `${title || ''} ${excerpt || ''} ${(content || '').substring(0, 500)}`.trim();
  if (!text || text.length < 10) {
    return { important: false, score: 0, reason: 'Text too short' };
  }

  const cacheKey = generateCacheKey(text);
  const cached = await getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const prompt = `Analyze this news article and determine if it's IMPORTANT. Important news includes:
- Breaking news, major events, significant policy changes
- Economic/financial news affecting markets or personal finance
- Health emergencies, safety alerts
- Major political developments
- Significant business news
- Technology breakthroughs affecting daily life

NOT important:
- Celebrity gossip, entertainment news
- Routine sports scores
- Minor local events
- Opinion pieces without news value
- Advertisements or promotional content

Article title: "${title || 'N/A'}"
Article excerpt: "${excerpt || 'N/A'}"

Respond with ONLY a JSON object: {"important": true/false, "score": 0-100, "reason": "brief explanation"}`;

    const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

    const response = await axios.post(
      HF_ROUTER_URL,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    let outputText = '';
    if (response.data && response.data.choices && response.data.choices[0]) {
      const msg = response.data.choices[0].message;
      outputText = (msg && msg.content) ? msg.content : '';
    }

    if (!outputText) {
      return { important: false, score: 0, reason: 'No AI response' };
    }

    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const result = {
          important: Boolean(parsed.important),
          score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
          reason: String(parsed.reason || 'AI analysis')
        };
        await setCachedResult(cacheKey, result);
        return result;
      } catch (e) {
      }
    }

    const lower = outputText.toLowerCase();
    const hasImportant = lower.includes('"important": true') || lower.includes('important: true') || lower.includes('important":true');
    const scoreMatch = outputText.match(/"score":\s*(\d+)/i) || outputText.match(/score[:\s]+(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : (hasImportant ? 70 : 30);

    const result = {
      important: hasImportant || score >= 60,
      score: Math.min(100, Math.max(0, score)),
      reason: 'AI analysis'
    };
    await setCachedResult(cacheKey, result);
    return result;

  } catch (error) {
    if (error.response && error.response.status === 503) {
      return { important: false, score: 0, reason: 'AI model loading, try again in a moment' };
    }
    return { important: false, score: 0, reason: `AI error: ${error.message}` };
  }
};

module.exports = {
  scoreImportance
};

