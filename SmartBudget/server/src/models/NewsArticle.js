const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NewsArticle = sequelize.define('NewsArticle', {
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
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  excerpt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  image_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fetched_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'bg'
  },
  is_processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_ai_summarized: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_ai_classified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  share_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'news_articles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['published_at'] },
    { fields: ['fetched_at'] },
    { fields: ['is_processed'] },
    { fields: ['title'], length: 100 }
  ]
});

module.exports = NewsArticle;
