const deviceService = require('../services/deviceService');
const logger = require('../utils/logger');

// 獲取所有儀器列表
const getDevices = async (req, res) => {
  try {
    const devices = await deviceService.getAllDevices();
    res.json(devices);
  } catch (error) {
    logger.error(`獲取設備列表錯誤: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getDevices
};
