const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  register,
  login,
  logout,
  logoutAll,
  getProfile,
  updateProfile,
  updatePassword
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.post('/logout-all', authenticateToken, logoutAll);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, updatePassword);

module.exports = router;

