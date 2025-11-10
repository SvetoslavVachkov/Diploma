const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NewsSource = sequelize.define('NewsSource', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  rss_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  api_key: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  logo_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'bg'
  },
  country: {
    type: DataTypes.STRING(10),
    defaultValue: 'BG'
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_fetch_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fetch_interval_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  }
}, {
  tableName: 'news_sources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = NewsSource;
