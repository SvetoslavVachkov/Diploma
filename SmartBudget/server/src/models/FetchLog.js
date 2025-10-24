const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FetchLog = sequelize.define('FetchLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  source_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'news_sources',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('success', 'error', 'warning'),
    allowNull: false
  },
  articles_fetched: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  fetched_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'fetch_logs',
  timestamps: false,
  indexes: [
    { fields: ['fetched_at'] },
    { fields: ['status'] }
  ]
});

module.exports = FetchLog;
