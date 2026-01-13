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

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    const previousAction = req.session.pendingAction || null;
    const previousActionData = req.session.pendingActionData || null;

    const result = await chatWithAI(userId, message.trim(), apiKey, model, previousAction, previousActionData);

    if (result.success) {
      const responseData = {
        response: result.response,
        context: result.context
      };
      
      if (result.action) {
        responseData.action = result.action;
      }
      
      if (result.requiresConfirmation) {
        responseData.requiresConfirmation = true;
        responseData.action = result.action;
        responseData.actionData = result.actionData;
        req.session.pendingAction = result.action;
        req.session.pendingActionData = result.actionData;
      } else {
        req.session.pendingAction = null;
        req.session.pendingActionData = null;
      }
      
      if (result.data) {
        responseData.data = result.data;
      }
      
      res.status(200).json({
        status: 'success',
        data: responseData
      });
    } else {
      req.session.pendingAction = null;
      req.session.pendingActionData = null;
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

