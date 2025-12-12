const jwt = require('jsonwebtoken');
const { User, UserSession } = require('../models');
const { Op } = require('sequelize');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    
    const session = await UserSession.findOne({
      where: {
        user_id: decoded.userId,
        expires_at: {
          [Op.gt]: new Date()
        }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'first_name', 'last_name', 'is_active']
      }]
    });

    if (!session || !session.user || !session.user.is_active) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }

    req.user = session.user;
    req.session = session;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired'
      });
    }
    return res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const session = await UserSession.findOne({
        where: {
          user_id: decoded.userId,
          expires_at: {
            [Op.gt]: new Date()
          }
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'first_name', 'last_name', 'is_active']
        }]
      });

      if (session && session.user && session.user.is_active) {
        req.user = session.user;
        req.session = session;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};

