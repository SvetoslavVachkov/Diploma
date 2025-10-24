const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AICache = sequelize.define('AICache', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cache_key: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  result: {
    type: DataTypes.JSON,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'ai_cache',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['expires_at'] }
  ]
});

module.exports = AICache;
