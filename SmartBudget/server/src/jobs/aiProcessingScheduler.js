const cron = require('node-cron');
const { processUnprocessedArticles } = require('../services/ai/processingPipeline');

let processingJob = null;

const initializeAIProcessingScheduler = () => {
  if (processingJob) {
    processingJob.stop();
  }

  processingJob = cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Processing unprocessed articles...');
    const result = await processUnprocessedArticles({ limit: 20, batchSize: 5 });
    console.log(`[Cron] Processed ${result.processed} articles, ${result.failed} failed`);
  }, {
    scheduled: true,
    timezone: 'Europe/Sofia'
  });

  console.log('AI processing scheduler initialized (runs every 30 minutes)');
};

const stopAIProcessingScheduler = () => {
  if (processingJob) {
    processingJob.stop();
    processingJob = null;
    console.log('AI processing scheduler stopped');
  }
};

module.exports = {
  initializeAIProcessingScheduler,
  stopAIProcessingScheduler
};

