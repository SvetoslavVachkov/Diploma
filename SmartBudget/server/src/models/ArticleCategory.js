const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ArticleCategory = sequelize.define('ArticleCategory', {
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
  category_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'news_categories',
      key: 'id'
    }
  },
  confidence_score: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 1.0
  }
}, {
  tableName: 'article_categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['article_id', 'category_id']
    }
  ]
});

module.exports = ArticleCategory;
