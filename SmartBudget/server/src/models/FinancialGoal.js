const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FinancialGoal = sequelize.define('FinancialGoal', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  target_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  current_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  target_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  goal_type: {
    type: DataTypes.ENUM('savings', 'debt_payoff', 'investment', 'purchase'),
    allowNull: false
  },
  is_achieved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'financial_goals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id', 'is_achieved'] }
  ]
});

module.exports = FinancialGoal;
