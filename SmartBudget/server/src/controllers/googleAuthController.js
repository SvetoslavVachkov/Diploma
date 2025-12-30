const { registerUser } = require('../services/authService');
const { User } = require('../models');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UserSession } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY_HOURS = 24 * 7 * 30;

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: `${TOKEN_EXPIRY_HOURS}h` }
  );
};

const googleAuth = async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    if (!email.includes('@gmail.com')) {
      return res.redirect('/api/auth/google?error=invalid_email');
    }

    let user = await User.findOne({ where: { email } });

    if (!user) {
      const password = crypto.randomBytes(32).toString('hex');
      const passwordHash = require('bcryptjs').hashSync(password, 10);
      
      user = await User.create({
        email,
        password_hash: passwordHash,
        first_name: email.split('@')[0] || '',
        last_name: '',
        preferences: {}
      });
    }

    const token = generateToken(user.id);
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await UserSession.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    });

    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3001'}/auth/google?token=${token}`);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Google authentication failed',
      error: error.message
    });
  }
};

const googleCallback = async (req, res) => {
  res.redirect('/api/auth/google');
};

module.exports = {
  googleAuth,
  googleCallback
};

