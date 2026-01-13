const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReceiptProduct = sequelize.define('ReceiptProduct', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transaction_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'financial_transactions',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'products',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.00
  },
  unit_price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  total_price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  subcategory: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  health_info: {
    type: DataTypes.JSON,
    allowNull: true
  },
  tips: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'receipt_products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = ReceiptProduct;

