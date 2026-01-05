const { getMoneyAdvice } = require('../services/financial/moneyAdviceService');

const getAdviceHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const periodDays = parseInt(req.query.periodDays) || 90;

    const result = await getMoneyAdvice(userId, { periodDays });

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get money advice',
      error: error.message
    });
  }
};

module.exports = {
  getAdviceHandler
};

