const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { scanReceipt } = require('../services/financial/receiptScanService');
const { authenticateToken } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only text files are allowed'));
    }
  }
});

const uploadReceipt = upload.single('receiptFile');

const scanReceiptHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }
    
    const receiptText = req.body.receipt_text || '';
    const receiptFile = req.file || null;
    
    if (!receiptText.trim() && !receiptFile) {
      return res.status(400).json({
        status: 'error',
        message: 'Receipt text or file is required'
      });
    }
    
    const result = await scanReceipt(userId, receiptText, receiptFile);
    
    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: {
          imported: result.imported,
          total: result.total,
          results: result.results
        }
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) {
        }
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Failed to scan receipt',
      error: error.message
    });
  }
};

module.exports = {
  scanReceiptHandler,
  uploadReceipt
};
