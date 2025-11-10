const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserInterest = sequelize.define('UserInterest', {
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
  category_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'news_categories',
      key: 'id'
    }
  },
  weight: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 1.0
  }
}, {
  tableName: 'user_interests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'category_id']
    }
  ]
});

module.exports = UserInterest;
