require('dotenv').config();
const { sequelize } = require('../config/database');
const { NewsArticle } = require('../models');
const { processArticle, processUnprocessedArticles } = require('../services/ai/processingPipeline');

const testAIProcessing = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established');

    const unprocessedCount = await NewsArticle.count({
      where: { is_processed: false }
    });

    console.log(`Found ${unprocessedCount} unprocessed articles`);

    if (unprocessedCount === 0) {
      console.log('No unprocessed articles found. Fetching a sample article...');
      const sampleArticle = await NewsArticle.findOne({
        order: [['created_at', 'DESC']]
      });

      if (sampleArticle) {
        console.log(`Processing sample article: ${sampleArticle.title}`);
        const result = await processArticle(sampleArticle.id, { force: true });
        console.log('Processing result:', JSON.stringify(result, null, 2));
      } else {
        console.log('No articles found in database. Please fetch some articles first.');
      }
      return;
    }

    console.log('Processing unprocessed articles...');
    const result = await processUnprocessedArticles({ limit: 5, batchSize: 2 });

    console.log('\n=== Processing Results ===');
    console.log(`Processed: ${result.processed}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Total: ${result.total}`);

    if (result.results && result.results.length > 0) {
      console.log('\n=== Individual Results ===');
      result.results.forEach((r, index) => {
        if (r.success && !r.skipped) {
          console.log(`\nArticle ${index + 1}:`);
          console.log(`  - Classification: ${r.results.classification ? 'Yes' : 'No'}`);
          console.log(`  - Sentiment: ${r.results.sentiment ? r.results.sentiment.sentiment : 'N/A'}`);
          console.log(`  - Summary: ${r.results.summary ? 'Yes' : 'No'}`);
          console.log(`  - Categories assigned: ${r.results.categoriesAssigned}`);
          console.log(`  - Processing time: ${r.processingTime}ms`);
        } else if (r.skipped) {
          console.log(`Article ${index + 1}: Skipped (already processed)`);
        } else {
          console.log(`Article ${index + 1}: Failed - ${r.error}`);
        }
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

testAIProcessing();

