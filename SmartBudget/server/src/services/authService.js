const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, UserSession } = require('../models');
const { Op } = require('sequelize');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 24 * 7;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: `${TOKEN_EXPIRY_HOURS}h` }
  );
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const registerUser = async (userData) => {
  try {
    const existingUser = await User.findOne({
      where: { email: userData.email }
    });

    if (existingUser) {
      return {
        success: false,
        error: 'Email already registered'
      };
    }

    const passwordHash = await hashPassword(userData.password);
    
    const user = await User.create({
      email: userData.email,
      password_hash: passwordHash,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      preferences: userData.preferences || {}
    });

    const token = generateToken(user.id);
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await UserSession.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      },
      token
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const loginUser = async (email, password, rememberMe = false) => {
  try {
    const user = await User.findOne({
      where: { email }
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    if (!user.is_active) {
      return {
        success: false,
        error: 'Account is deactivated'
      };
    }

    const passwordValid = await comparePassword(password, user.password_hash);

    if (!passwordValid) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    await UserSession.destroy({
      where: {
        user_id: user.id,
        expires_at: {
          [Op.lt]: new Date()
        }
      }
    });

    const expiryHours = rememberMe ? TOKEN_EXPIRY_HOURS * 30 : TOKEN_EXPIRY_HOURS;
    const token = jwt.sign(
      { userId: user.id, type: 'access' },
      JWT_SECRET,
      { expiresIn: `${expiryHours}h` }
    );
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    await UserSession.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      },
      token
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const logoutUser = async (userId, token) => {
  try {
    const tokenHash = hashToken(token);
    
    await UserSession.destroy({
      where: {
        user_id: userId,
        token_hash: tokenHash
      }
    });

    return {
      success: true,
      message: 'Logged out successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const logoutAllSessions = async (userId) => {
  try {
    await UserSession.destroy({
      where: {
        user_id: userId
      }
    });

    return {
      success: true,
      message: 'All sessions logged out'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const getUserProfile = async (userId) => {
  try {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'first_name', 'last_name', 'avatar_url', 'preferences', 'created_at']
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const updateUserProfile = async (userId, updateData) => {
  try {
    const user = await User.findByPk(userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const allowedFields = ['first_name', 'last_name', 'avatar_url', 'preferences'];
    const updateFields = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field];
      }
    });

    await user.update(updateFields);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        preferences: user.preferences
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    const user = await User.findByPk(userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const passwordValid = await comparePassword(currentPassword, user.password_hash);

    if (!passwordValid) {
      return {
        success: false,
        error: 'Current password is incorrect'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    await user.update({ password_hash: newPasswordHash });

    await logoutAllSessions(userId);

    return {
      success: true,
      message: 'Password changed successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  logoutAllSessions,
  getUserProfile,
  updateUserProfile,
  changePassword
};

