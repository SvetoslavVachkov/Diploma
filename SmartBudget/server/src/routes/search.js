const express = require('express');
const router = express.Router();
const { search, suggestions, filterOptions } = require('../controllers/searchController');

router.get('/', search);
router.get('/suggestions', suggestions);
router.get('/filters', filterOptions);

module.exports = router;

