const { chatWithAI } = require('../services/financial/aiChatService');

const chatHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required'
      });
    }

    const apiKey = process.env.HF_TXN_API_KEY;
    const model = process.env.HF_TXN_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';

    const result = await chatWithAI(userId, message.trim(), apiKey, model);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: {
          response: result.response,
          context: result.context
        }
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
      message: 'Failed to process chat message',
      error: error.message
    });
  }
};

module.exports = {
  chatHandler
};

