const fs = require('fs-extra');
const path = require('path');
const { DATA_DIR } = require('../config/config');
const csvParser = require('../utils/csvParser');
const dataService = require('./dataService');
const logger = require('../utils/logger');

/**
 * 掃描所有設備的最新數據
 * @returns {Promise<void>}
 */
const scanLatestData = async () => {
  try {
    logger.info('開始掃描設備數據...');
    
    // 檢查根目錄是否存在
    const exists = await fs.pathExists(DATA_DIR);
    if (!exists) {
      logger.error(`數據目錄 ${DATA_DIR} 不存在`);
      return;
    }
    
    // 獲取所有設備目錄
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const deviceDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(async name => await fs.pathExists(path.join(DATA_DIR, name, 'signal_log')));
    
    logger.info(`找到 ${deviceDirs.length} 個設備`);
    
    // 掃描每個設備的最新數據
    for (const deviceId of deviceDirs) {
      try {
        await scanDeviceLatestData(deviceId);
      } catch (error) {
        logger.error(`掃描設備 ${deviceId} 錯誤: ${error.message}`);
      }
    }
    
    logger.info('設備數據掃描完成');
  } catch (error) {
    logger.error(`掃描數據錯誤: ${error.message}`);
  }
};

/**
 * 掃描特定設備的最新數據
 * @param {string} deviceId - 設備ID
 * @returns {Promise<void>}
 */
const scanDeviceLatestData = async (deviceId) => {
  try {
    const signalLogPath = path.join(DATA_DIR, deviceId, 'signal_log');
    const exists = await fs.pathExists(signalLogPath);
    
    if (!exists) {
      logger.warn(`設備 ${deviceId} 沒有信號日誌目錄`);
      return;
    }
    
    // 獲取所有日期目錄
    const dateDirs = await fs.readdir(signalLogPath);
    if (dateDirs.length === 0) {
      logger.warn(`設備 ${deviceId} 沒有任何數據日期目錄`);
      return;
    }
    
    // 按日期排序，獲取最新的
    dateDirs.sort((a, b) => b.localeCompare(a));
    const latestDateDir = path.join(signalLogPath, dateDirs[0]);
    
    // 獲取最新日期下的所有文件
    const files = await fs.readdir(latestDateDir);
    if (files.length === 0) {
      logger.warn(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何數據文件`);
      return;
    }
    
    // 按文件名（時間）排序，獲取最新的
    files.sort((a, b) => b.localeCompare(a));
    const latestFile = path.join(latestDateDir, files[0]);
    
    // 解析最新的 CSV 文件
    const data = await csvParser.parseCSVFile(latestFile);
    
    if (data.length > 0) {
      // 更新緩存
      dataService.updateLatestDataCache(deviceId, data[0]);
      logger.info(`設備 ${deviceId} 最新數據已更新, 時間戳: ${data[0].timestamp}`);
    } else {
      logger.warn(`設備 ${deviceId} 最新數據文件為空`);
    }
  } catch (error) {
    logger.error(`掃描設備 ${deviceId} 最新數據錯誤: ${error.message}`);
    throw error;
  }
};

module.exports = {
  scanLatestData,
  scanDeviceLatestData
};
