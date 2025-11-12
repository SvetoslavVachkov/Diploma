require('dotenv').config();
const { sequelize, NewsSource, NewsArticle, FetchLog } = require('../models');
const { fetchArticlesFromSource, fetchAllActiveSources } = require('../services/newsFetcher');

const testNewsFetcher = async () => {
  try {
    console.log('=== Testing News Fetcher Service ===\n');

    await sequelize.authenticate();
    console.log('Database connection successful\n');

    console.log('1. Checking existing sources...');
    const sources = await NewsSource.findAll();
    console.log(`   Found ${sources.length} sources in database\n`);

    if (sources.length === 0) {
      console.log('   No sources found. Creating test source...');
      
      const testSource = await NewsSource.create({
        name: 'BBC News',
        url: 'https://www.bbc.com',
        rss_url: 'https://feeds.bbci.co.uk/news/rss.xml',
        language: 'en',
        country: 'GB',
        is_active: true,
        fetch_interval_minutes: 60
      });

      console.log(`    Created test source: ${testSource.name} (ID: ${testSource.id})\n`);
      
      console.log('2. Testing RSS fetch for test source...');
      const result = await fetchArticlesFromSource(testSource.id);
      
      console.log(`   Status: ${result.success ? 'Success' : 'Failed'}`);
      console.log(`   Message: ${result.message}`);
      console.log(`   Articles fetched: ${result.articlesFetched}`);
      console.log(`   Duration: ${result.duration}ms\n`);

      if (result.articlesFetched > 0) {
        console.log('3. Verifying articles in database...');
        const articles = await NewsArticle.findAll({
          where: { source_id: testSource.id },
          limit: 5,
          order: [['created_at', 'DESC']]
        });

        console.log(`   Found ${articles.length} articles:\n`);
        articles.forEach((article, index) => {
          console.log(`   ${index + 1}. ${article.title.substring(0, 60)}...`);
          console.log(`      URL: ${article.url.substring(0, 80)}...`);
          console.log(`      Published: ${article.published_at || 'N/A'}`);
          console.log(`      Processed: ${article.is_processed ? 'Yes' : 'No'}\n`);
        });
      }

      console.log('4. Checking fetch logs...');
      const logs = await FetchLog.findAll({
        where: { source_id: testSource.id },
        order: [['fetched_at', 'DESC']],
        limit: 3
      });

      console.log(`   Found ${logs.length} recent logs:\n`);
      logs.forEach((log, index) => {
        console.log(`   ${index + 1}. Status: ${log.status}`);
        console.log(`      Articles: ${log.articles_fetched}`);
        console.log(`      Duration: ${log.duration_ms}ms`);
        console.log(`      Time: ${log.fetched_at}`);
        if (log.error_message) {
          console.log(`      Error: ${log.error_message}`);
        }
        console.log('');
      });

    } else {
      console.log('2. Testing fetch for first active source...');
      const activeSource = sources.find(s => s.is_active) || sources[0];
      
      if (!activeSource) {
        console.log('    No active sources found');
        return;
      }

      console.log(`   Source: ${activeSource.name}`);
      console.log(`   RSS URL: ${activeSource.rss_url || 'N/A'}`);
      console.log(`   API Key: ${activeSource.api_key ? 'Set' : 'Not set'}\n`);

      const result = await fetchArticlesFromSource(activeSource.id);
      
      console.log(`   Status: ${result.success ? 'Success' : 'Failed'}`);
      console.log(`   Message: ${result.message}`);
      console.log(`   Articles fetched: ${result.articlesFetched}`);
      console.log(`   Duration: ${result.duration}ms\n`);

      console.log('3. Checking total articles in database...');
      const totalArticles = await NewsArticle.count();
      const sourceArticles = await NewsArticle.count({
        where: { source_id: activeSource.id }
      });
      
      console.log(`   Total articles: ${totalArticles}`);
      console.log(`   Articles from this source: ${sourceArticles}\n`);

      console.log('4. Recent fetch logs...');
      const logs = await FetchLog.findAll({
        where: { source_id: activeSource.id },
        order: [['fetched_at', 'DESC']],
        limit: 5
      });

      logs.forEach((log, index) => {
        console.log(`   ${index + 1}. [${log.status}] ${log.articles_fetched} articles in ${log.duration_ms}ms`);
      });
      console.log('');
    }

    console.log('5. Testing...');
    const allResults = await fetchAllActiveSources();
    
    console.log(`   Processed ${allResults.length} sources:\n`);
    allResults.forEach(result => {
      const icon = result.success ? '' : '';
      console.log(`   ${icon} ${result.sourceName}: ${result.articlesFetched} articles`);
      if (!result.success) {
        console.log(`      Error: ${result.message}`);
      }
    });

    console.log('\n=== Test Complete ===');
    process.exit(0);

  } catch (error) {
    console.error('\nTest failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
};

testNewsFetcher();

