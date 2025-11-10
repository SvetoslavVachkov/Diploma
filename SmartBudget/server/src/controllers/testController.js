const { sequelize, NewsCategory, FinancialCategory } = require('../models');

const testConnection = async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: 'success',
      message: 'Database connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
};

const getNewsCategories = async (req, res) => {
  try {
    const categories = await NewsCategory.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    });
    
    res.status(200).json({
      status: 'success',
      count: categories.length,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch news categories',
      error: error.message
    });
  }
};

const getFinancialCategories = async (req, res) => {
  try {
    const categories = await FinancialCategory.findAll({
      where: { is_active: true },
      order: [['type', 'ASC'], ['name', 'ASC']]
    });
    
    res.status(200).json({
      status: 'success',
      count: categories.length,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch financial categories',
      error: error.message
    });
  }
};

module.exports = {
  testConnection,
  getNewsCategories,
  getFinancialCategories
};
