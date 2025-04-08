const express = require('express');
const deviceController = require('../controllers/deviceController');
const router = express.Router();

/**
 * @route GET /api/devices
 * @desc 獲取所有可用的設備列表
 */
router.get('/devices', deviceController.getDevices);

module.exports = router;
