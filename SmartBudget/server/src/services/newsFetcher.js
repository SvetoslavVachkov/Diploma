const { NewsSource, NewsArticle, FetchLog } = require('../models');
const { fetchRSSFeed } = require('./rssFetcher');
const { fetchNewsAPI, fetchGenericAPI } = require('./apiFetcher');
const { checkDuplicatesBatch } = require('../utils/articleDeduplicator');

const fetchArticlesFromSource = async (sourceId) => {
  const startTime = Date.now();
  let articlesFetched = 0;
  let errorMessage = null;
  let status = 'success';

  try {
    const source = await NewsSource.findByPk(sourceId);
    
    if (!source) {
      throw new Error(`Source with ID ${sourceId} not found`);
    }

    if (!source.is_active) {
      return {
        success: false,
        message: `Source ${source.name} is inactive`,
        articlesFetched: 0
      };
    }

    let fetchResult = { success: false, articles: [], error: null };

    if (source.rss_url) {
      fetchResult = await fetchRSSFeed(source.rss_url, source.name);
    } else if (source.api_key && source.url) {
      if (source.url.includes('newsapi.org')) {
        fetchResult = await fetchNewsAPI(source.api_key, source.name, {
          language: source.language,
          country: source.country
        });
      } else {
        fetchResult = await fetchGenericAPI(source.url, source.api_key, source.name);
      }
    } else {
      throw new Error('Source has no RSS URL or API configuration');
    }

    if (!fetchResult.success) {
      status = 'error';
      errorMessage = fetchResult.error;
    } else {
      if (fetchResult.articles.length === 0) {
        status = 'warning';
        errorMessage = 'No articles found in feed';
      } else {
        const articleUrls = fetchResult.articles.map(a => a.url);
        const duplicates = await checkDuplicatesBatch(articleUrls, sourceId);
        
        const articlesToInsert = fetchResult.articles.filter(
          article => !duplicates.has(article.url)
        );

        if (articlesToInsert.length > 0) {
          try {
            await NewsArticle.bulkCreate(
            articlesToInsert.map(articleData => ({
              source_id: sourceId,
              title: articleData.title.substring(0, 500),
              content: articleData.content || null,
              excerpt: articleData.excerpt || null,
              url: articleData.url,
              image_url: articleData.image_url || null,
              published_at: articleData.published_at || new Date(),
              language: source.language || 'bg',
              is_processed: false,
              is_ai_summarized: false,
              is_ai_classified: false
              })),
              { ignoreDuplicates: true }
            );
            articlesFetched = articlesToInsert.length;
          } catch (bulkError) {
            console.error(`Bulk insert error:`, bulkError.message);
            for (const articleData of articlesToInsert) {
              try {
                await NewsArticle.create({
                  source_id: sourceId,
                  title: articleData.title.substring(0, 500),
                  content: articleData.content || null,
                  excerpt: articleData.excerpt || null,
                  url: articleData.url,
                  image_url: articleData.image_url || null,
                  published_at: articleData.published_at || new Date(),
                  language: source.language || 'bg',
                  is_processed: false,
                  is_ai_summarized: false,
                  is_ai_classified: false
                });
                articlesFetched++;
              } catch (createError) {
                if (createError.name !== 'SequelizeUniqueConstraintError') {
                  console.error(`Error creating article "${articleData.title}":`, createError.message);
                }
              }
            }
          }
        }
      }
    }

    if (fetchResult.success && articlesFetched === 0 && fetchResult.articles.length > 0) {
      status = 'warning';
      errorMessage = 'All articles were duplicates';
    }

    await source.update({
      last_fetch_at: new Date()
    });

    const duration = Date.now() - startTime;

    await FetchLog.create({
      source_id: sourceId,
      status,
      articles_fetched: articlesFetched,
      error_message: errorMessage,
      duration_ms: duration
    });

    return {
      success: fetchResult.success,
      message: fetchResult.success 
        ? `Fetched ${articlesFetched} new articles from ${source.name}`
        : `Failed to fetch from ${source.name}: ${errorMessage}`,
      articlesFetched,
      duration
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    status = 'error';
    errorMessage = error.message;

    try {
      await FetchLog.create({
        source_id: sourceId,
        status,
        articles_fetched: 0,
        error_message: errorMessage,
        duration_ms: duration
      });
    } catch (logError) {
      console.error('Failed to create fetch log:', logError.message);
    }

    return {
      success: false,
      message: `Error fetching from source: ${errorMessage}`,
      articlesFetched: 0,
      duration
    };
  }
};

const fetchAllActiveSources = async () => {
  try {
    const sources = await NewsSource.findAll({
      where: { is_active: true }
    });

    const results = [];

    for (const source of sources) {
      const shouldFetch = !source.last_fetch_at || 
        (Date.now() - new Date(source.last_fetch_at).getTime()) >= 
        (source.fetch_interval_minutes * 60 * 1000);

      if (shouldFetch) {
        const result = await fetchArticlesFromSource(source.id);
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          ...result
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          success: true,
          message: 'Skipped - not yet time to fetch',
          articlesFetched: 0
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error in fetchAllActiveSources:', error);
    return [];
  }
};

module.exports = {
  fetchArticlesFromSource,
  fetchAllActiveSources
};

