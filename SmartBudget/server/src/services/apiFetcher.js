const axios = require('axios');

const fetchNewsAPI = async (apiKey, sourceName, options = {}) => {
  try {
    const baseUrl = options.baseUrl || 'https://newsapi.org/v2';
    const endpoint = options.endpoint || 'everything';
    const params = {
      apiKey,
      ...options.params
    };

    if (options.country) {
      params.country = options.country;
    }

    if (options.language) {
      params.language = options.language;
    }

    const response = await axios.get(`${baseUrl}/${endpoint}`, {
      params,
      timeout: 15000,
      headers: {
        'User-Agent': 'SmartBudget-NewsFetcher/1.0'
      }
    });

    if (!response.data || !response.data.articles) {
      return { success: false, articles: [], error: 'Invalid API response' };
    }

    const articles = response.data.articles
      .filter(item => item.title && item.url)
      .map(item => {
        const publishedDate = item.publishedAt 
          ? new Date(item.publishedAt) 
          : new Date();

        const content = item.content || item.description || '';
        const excerpt = item.description || content.substring(0, 300) || '';

        return {
          title: item.title,
          content: content,
          excerpt: excerpt.length > 500 ? excerpt.substring(0, 500) : excerpt,
          url: item.url,
          image_url: item.urlToImage || null,
          published_at: publishedDate
        };
      });

    return { success: true, articles, error: null };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`News API fetch error for ${sourceName}:`, error.message);
    }
    
    if (error.response) {
      return { 
        success: false, 
        articles: [], 
        error: `API Error: ${error.response.status} - ${error.response.data?.message || error.message}` 
      };
    }

    return { 
      success: false, 
      articles: [], 
      error: error.message || 'Unknown API error' 
    };
  }
};

const fetchGenericAPI = async (apiUrl, apiKey, sourceName, options = {}) => {
  try {
    const headers = {
      'User-Agent': 'SmartBudget-NewsFetcher/1.0',
      ...options.headers
    };

    if (apiKey) {
      if (options.authType === 'bearer') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else if (options.authType === 'header') {
        headers[options.headerName || 'X-API-Key'] = apiKey;
      } else {
        headers['X-API-Key'] = apiKey;
      }
    }

    const response = await axios.get(apiUrl, {
      headers,
      params: options.params || {},
      timeout: 15000
    });

    const articles = options.transform 
      ? options.transform(response.data)
      : extractArticlesFromResponse(response.data);

    return { success: true, articles, error: null };
  } catch (error) {
    console.error(`Generic API fetch error for ${sourceName}:`, error.message);
    return { 
      success: false, 
      articles: [], 
      error: error.message || 'Unknown API error' 
    };
  }
};

const extractArticlesFromResponse = (data) => {
  if (Array.isArray(data)) {
    return data.map(item => ({
      title: item.title || item.headline || 'Untitled',
      content: item.content || item.body || item.description || '',
      excerpt: (item.excerpt || item.summary || item.description || '').substring(0, 500),
      url: item.url || item.link || item.permalink || '',
      image_url: item.image || item.imageUrl || item.thumbnail || null,
      published_at: item.publishedAt ? new Date(item.publishedAt) : new Date()
    })).filter(article => article.url && article.title);
  }

  if (data.articles && Array.isArray(data.articles)) {
    return extractArticlesFromResponse(data.articles);
  }

  if (data.results && Array.isArray(data.results)) {
    return extractArticlesFromResponse(data.results);
  }

  return [];
};

module.exports = {
  fetchNewsAPI,
  fetchGenericAPI
};

