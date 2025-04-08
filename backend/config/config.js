require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR: process.env.DATA_DIR || 'C:/vp/upload_log',
  SCAN_INTERVAL: parseInt(process.env.SCAN_INTERVAL || '60', 10), // 單位：秒
  NODE_ENV: process.env.NODE_ENV || 'development'
};
