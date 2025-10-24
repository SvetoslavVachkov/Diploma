const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AIAnalysis = sequelize.define('AIAnalysis', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  article_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'news_articles',
      key: 'id'
    }
  },
  analysis_type: {
    type: DataTypes.ENUM('sentiment', 'summary', 'classification', 'keywords'),
    allowNull: false
  },
  result: {
    type: DataTypes.JSON,
    allowNull: false
  },
  confidence_score: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true
  },
  model_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  processing_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'ai_analysis',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['analysis_type'] }
  ]
});

module.exports = AIAnalysis;
