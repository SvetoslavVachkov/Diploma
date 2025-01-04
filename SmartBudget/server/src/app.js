const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { sequelize } = require('./models');
const { initializeScheduler } = require('./jobs/newsFetchScheduler');
const { initializeAIProcessingScheduler } = require('./jobs/aiProcessingScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));
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
  if (process.env.NODE_ENV === 'development') {
    console.error('Server error:', err.message);
  }
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
      app.listen(PORT, async () => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Server started on port ${PORT}`);
          console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        }
        
        if (process.env.ENABLE_NEWS_FETCHER !== 'false') {
          await initializeScheduler();
        }
        
        if (process.env.ENABLE_AI_PROCESSING !== 'false') {
          initializeAIProcessingScheduler();
        }
      });
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.error('Database connection failed');
      }
      process.exit(1);
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Server startup failed:', error.message);
    }
    process.exit(1);
  }
};

startServer();

module.exports = app;
