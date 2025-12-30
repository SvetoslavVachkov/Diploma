const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { sequelize } = require('./models');
const { initializeScheduler } = require('./jobs/newsFetchScheduler');
const { initializeAIProcessingScheduler } = require('./jobs/aiProcessingScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ credentials: true, origin: process.env.CLIENT_URL || 'http://localhost:3001' }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'SmartBudget API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/test', require('./routes/test'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/news', require('./routes/news'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/search', require('./routes/search'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/personalization', require('./routes/personalization'));

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

const startServer = async () => {
  try {
    const connected = await testConnection();
    
    if (connected) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Syncing database models...');
      }
      
      app.listen(PORT, async () => {
        console.log(`SmartBudget API server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
        console.log(`Test DB: http://localhost:${PORT}/api/test/db`);
        console.log(`Test Categories: http://localhost:${PORT}/api/test/categories/news`);
        
        if (process.env.ENABLE_NEWS_FETCHER !== 'false') {
          await initializeScheduler();
        }
        
        if (process.env.ENABLE_AI_PROCESSING !== 'false') {
          initializeAIProcessingScheduler();
        }
      });
    } else {
      console.error('Failed to connect to database. Server not started.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
