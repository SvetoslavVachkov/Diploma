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

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
        if (result.lastTransaction) {
          req.session.pendingAction = 'show_last_transaction';
          req.session.pendingActionData = { lastTransaction: result.lastTransaction };
        } else {
          req.session.pendingAction = null;
          req.session.pendingActionData = null;
        }
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
    console.error('Error in chatHandler:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process chat message',
      error: error.message || 'Unknown error'
    });
  }
};

module.exports = {
  chatHandler
};

