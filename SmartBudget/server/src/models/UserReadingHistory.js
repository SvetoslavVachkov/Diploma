const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserReadingHistory = sequelize.define('UserReadingHistory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  article_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'news_articles',
      key: 'id'
    }
  },
  read_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  time_spent_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  scroll_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  }
}, {
  tableName: 'user_reading_history',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'article_id']
    }
  ]
});

module.exports = UserReadingHistory;
