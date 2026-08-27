const express = require('express');
const profileRoutes = require('../modules/profile/profileRoutes');

const router = express.Router();

router.use('/profile', profileRoutes);

module.exports = router;
