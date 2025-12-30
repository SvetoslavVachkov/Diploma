const { registerUser, loginUser, logoutUser, logoutAllSessions, getUserProfile, updateUserProfile, changePassword } = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');

const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, preferences } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    const validDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'abv.bg', 'mail.bg'];
    const domain = email.split('@')[1]?.toLowerCase();
    if (!validDomains.includes(domain)) {
      return res.status(400).json({
        status: 'error',
        message: 'Email domain not supported. Supported: gmail.com, yahoo.com, hotmail.com, outlook.com, abv.bg, mail.bg'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters'
      });
    }

    const result = await registerUser({
      email,
      password,
      first_name,
      last_name,
      preferences
    });

    if (result.success) {
      res.status(201).json({
        status: 'success',
        data: {
          user: result.user,
          token: result.token
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
      message: 'Registration failed',
      error: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    const result = await loginUser(email, password, rememberMe);

    if (result.success) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
      };
      
      res.cookie('token', result.token, cookieOptions);
      
      res.status(200).json({
        status: 'success',
        data: {
          user: result.user,
          token: result.token
        }
      });
    } else {
      res.status(401).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Login failed',
      error: error.message
    });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const result = await logoutUser(req.user.id, token);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: result.message
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
      message: 'Logout failed',
      error: error.message
    });
  }
};

const logoutAll = async (req, res) => {
  try {
    const result = await logoutAllSessions(req.user.id);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: result.message
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
      message: 'Logout failed',
      error: error.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await getUserProfile(req.user.id);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.user
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
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const result = await updateUserProfile(req.user.id, req.body);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.user
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
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password and new password are required'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters'
      });
    }

    const result = await changePassword(req.user.id, current_password, new_password);

    if (result.success) {
      res.status(200).json({
        status: 'success',
        message: result.message
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
      message: 'Failed to change password',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  logoutAll,
  getProfile,
  updateProfile,
  updatePassword
};

