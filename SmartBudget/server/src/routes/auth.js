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
const { googleAuth, googleCallback } = require('../controllers/googleAuthController');

router.post('/register', register);
router.post('/login', login);
router.get('/google', (req, res) => {
  const email = req.query.email;
  if (email) {
    return googleAuth(req, res);
  }
  res.send(`
    <html>
      <head><title>Google Login</title></head>
      <body style="font-family: Arial; padding: 40px; text-align: center;">
        <h2>Google Login</h2>
        <p>Въведете вашия Gmail адрес:</p>
        <form method="GET" action="/api/auth/google">
          <input type="email" name="email" placeholder="email@gmail.com" required style="padding: 10px; width: 300px; margin: 10px;">
          <br>
          <button type="submit" style="padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Влез</button>
        </form>
      </body>
    </html>
  `);
});
router.get('/google/callback', googleCallback);
router.post('/google', googleAuth);
router.post('/logout', authenticateToken, logout);
router.post('/logout-all', authenticateToken, logoutAll);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, updatePassword);

module.exports = router;

