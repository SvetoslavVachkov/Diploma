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
    const allowedTypes = ['.txt', '.text', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only text and image files are allowed'));
    }
  }
});

const uploadReceipt = upload.single('receiptFile');

const scanReceiptHandler = async (req, res) => {
  let fileToCleanup = null;
  
  req.setTimeout(180000);
  res.setTimeout(180000);
  
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
    
    if (receiptFile) {
      fileToCleanup = receiptFile.path;
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
    if (fileToCleanup && fs.existsSync(fileToCleanup)) {
      try {
        fs.unlinkSync(fileToCleanup);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
    }
    }
    
    console.error('Receipt scan error:', error);
    console.error('Error stack:', error.stack);
    
    const errorMessage = error.message || 'Failed to scan receipt';
    
    res.status(500).json({
      status: 'error',
      message: errorMessage.includes('OCR') || errorMessage.includes('extracted') 
        ? errorMessage 
        : `Грешка при сканиране на бележка: ${errorMessage}`
    });
  }
};

module.exports = {
  scanReceiptHandler,
  uploadReceipt
};
