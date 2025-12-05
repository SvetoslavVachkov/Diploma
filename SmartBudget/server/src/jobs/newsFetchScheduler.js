const cron = require('node-cron');
const { NewsSource, sequelize } = require('../models');
const { fetchArticlesFromSource, fetchAllActiveSources } = require('../services/newsFetcher');

let scheduledJobs = new Map();

const scheduleSourceFetch = (source) => {
  const jobId = `source-${source.id}`;

  if (scheduledJobs.has(jobId)) {
    const existingJob = scheduledJobs.get(jobId);
    existingJob.stop();
  }

  if (!source.is_active || (!source.rss_url && !source.api_key)) {
    return;
  }

  const intervalMinutes = source.fetch_interval_minutes || 60;
  const cronExpression = `*/${intervalMinutes} * * * *`;

  const job = cron.schedule(cronExpression, async () => {
    console.log(`[Cron] Fetching articles from ${source.name}...`);
    await fetchArticlesFromSource(source.id);
  }, {
    scheduled: true,
    timezone: 'Europe/Sofia'
  });

  scheduledJobs.set(jobId, job);
  console.log(`Scheduled fetch job for ${source.name} (every ${intervalMinutes} minutes)`);
};

const initializeScheduler = async () => {
  try {
    const sources = await NewsSource.findAll({
      where: { is_active: true }
    });

    sources.forEach(source => {
      scheduleSourceFetch(source);
    });

    const quickFetchJob = cron.schedule('*/15 * * * *', async () => {
      console.log('[Cron] Running quick fetch for sources due...');
      await fetchAllActiveSources();
    }, {
      scheduled: true,
      timezone: 'Europe/Sofia'
    });

    scheduledJobs.set('quick-fetch', quickFetchJob);

    console.log(`News fetch scheduler initialized with ${sources.length} active sources`);
  } catch (error) {
    console.error('Error initializing news fetch scheduler:', error);
  }
};

const stopAllJobs = () => {
  scheduledJobs.forEach((job, jobId) => {
    job.stop();
    console.log(`Stopped job: ${jobId}`);
  });
  scheduledJobs.clear();
};

const refreshScheduler = async () => {
  stopAllJobs();
  await initializeScheduler();
};

module.exports = {
  initializeScheduler,
  stopAllJobs,
  refreshScheduler,
  scheduleSourceFetch
};

