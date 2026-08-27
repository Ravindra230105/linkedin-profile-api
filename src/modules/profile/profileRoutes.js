const express = require('express');
const profileController = require('./profileController');

const router = express.Router();

router.get('/', profileController.getProfile);

module.exports = router;
