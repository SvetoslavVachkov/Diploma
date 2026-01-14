const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { importCSVTransactions } = require('../services/financial/csvImportService');
const { generateSpendingReport } = require('../services/financial/spendingReportService');
const { generateProfessionalReportAnalysis } = require('../services/financial/reportAnalysisService');
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
    cb(null, 'csv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.txt', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Само CSV, TXT и PDF файлове са разрешени'));
    }
  }
});

const uploadCSV = upload.single('csvFile');

const importCSVHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'File is required'
      });
    }

    const result = await importCSVTransactions(userId, req.file.path);

    fs.unlink(req.file.path, (err) => {
      if (err) {
      }
    });

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.results
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
      message: 'Failed to import CSV',
      error: error.message
    });
  }
};

const getSpendingReportHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const skipAI = req.query.skip_ai === 'true' || req.query.skip_ai === true;
    const result = await generateSpendingReport(
      userId,
      req.query.date_from,
      req.query.date_to,
      req.query.search,
      skipAI
    );

    if (result.success) {
      res.status(200).json({
        status: 'success',
        data: result.report
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
      message: 'Failed to generate spending report',
      error: error.message
    });
  }
};

const getReportAnalysisHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const reportResult = await generateSpendingReport(
      userId,
      req.query.date_from,
      req.query.date_to,
      req.query.search,
      true
    );

    if (!reportResult.success || !reportResult.report) {
      return res.status(400).json({
        status: 'error',
        message: reportResult.error || 'Failed to generate report data'
      });
    }

    const analysisResult = await generateProfessionalReportAnalysis(reportResult.report, {
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    });

    if (analysisResult.success) {
      res.status(200).json({
        status: 'success',
        data: {
          ai_analysis: analysisResult.analysis
        }
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: analysisResult.error || 'Failed to generate AI analysis'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate report analysis',
      error: error.message
    });
  }
};

module.exports = {
  importCSVHandler,
  getSpendingReportHandler,
  getReportAnalysisHandler,
  uploadCSV
};

