const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  getPersonalizedFeed,
  getRecommendedArticles,
  recordArticleRead,
  updateUserPreferences,
  getUserInterests
} = require('../services/personalizationService');

const getForYouFeed = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await getPersonalizedFeed(userId, {
      page: req.query.page,
      limit: req.query.limit
    });

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.articles,
        pagination: result.pagination
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
      message: 'Failed to get personalized feed',
      error: error.message
    });
  }
};

const getRecommended = async (req, res) => {
  try {
    const userId = req.user?.id;
    const articleId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const result = await getRecommendedArticles(userId, articleId, parseInt(req.query.limit) || 5);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.articles
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get recommendations',
      error: error.message
    });
  }
};

const markArticleRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { article_id, time_spent, scroll_percentage } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!article_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Article ID is required'
      });
    }

    const result = await recordArticleRead(userId, article_id, time_spent, scroll_percentage);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: 'Article marked as read'
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
      message: 'Failed to mark article as read',
      error: error.message
    });
  }
};

const updateInterests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { category_ids, action } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!category_ids || !Array.isArray(category_ids)) {
      return res.status(400).json({
        status: 'error',
        message: 'Category IDs array is required'
      });
    }

    const result = await updateUserPreferences(userId, category_ids, action || 'add');

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: 'Interests updated successfully'
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
      message: 'Failed to update interests',
      error: error.message
    });
  }
};

const getInterests = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const interests = await getUserInterests(userId);

    res.status(200).json({
      status: 'success',
      data: interests
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get interests',
      error: error.message
    });
  }
};

module.exports = {
  getForYouFeed,
  getRecommended,
  markArticleRead,
  updateInterests,
  getInterests
};

