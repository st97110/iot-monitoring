const fs = require('fs-extra');
const path = require('path');
const { DATA_DIR } = require('../config/config');
const logger = require('../utils/logger');

/**
 * 獲取所有儀器設備列表
 * @returns {Promise<Array>} 設備列表，包含ID和其他信息
 */
const getAllDevices = async () => {
  try {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const devices = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('WISE-')) {
        const devicePath = path.join(DATA_DIR, entry.name);
        const deviceInfo = await getDeviceInfo(entry.name, devicePath);
        devices.push(deviceInfo);
      }
    }
    
    return devices;
  } catch (error) {
    logger.error(`讀取設備列表錯誤: ${error.message}`);
    throw new Error('無法讀取設備列表');
  }
};

/**
 * 獲取特定設備的詳細信息
 * @param {string} deviceId - 設備ID
 * @param {string} devicePath - 設備目錄路徑
 * @returns {Promise<Object>} 設備詳細信息
 */
const getDeviceInfo = async (deviceId, devicePath) => {
  try {
    const signalLogPath = path.join(devicePath, 'signal_log');
    const hasData = await fs.pathExists(signalLogPath);
    
    let lastUpdated = null;
    let totalRecords = 0;
    
    if (hasData) {
      // 獲取最新數據時間
      const dateDirs = await fs.readdir(signalLogPath);
      if (dateDirs.length > 0) {
        // 按日期排序
        dateDirs.sort((a, b) => b.localeCompare(a));
        const latestDateDir = path.join(signalLogPath, dateDirs[0]);
        
        // 獲取最新文件
        const files = await fs.readdir(latestDateDir);
        if (files.length > 0) {
          files.sort((a, b) => b.localeCompare(a));
          const latestFile = files[0];
          const timestamp = latestFile.split('.')[0]; // 假設文件名是時間戳
          
          // 更新時間為目錄名+文件名
          lastUpdated = `${dateDirs[0]}T${timestamp}`;
          
          // 計算記錄總數
          totalRecords = await countTotalRecords(signalLogPath);
        }
      }
    }
    
    return {
      id: deviceId,
      name: deviceId.split('_')[1], // 提取MAC地址部分作為名稱
      model: deviceId.split('_')[0], // 提取模型部分
      lastUpdated,
      totalRecords,
      hasData
    };
  } catch (error) {
    logger.error(`獲取設備 ${deviceId} 詳情錯誤: ${error.message}`);
    return {
      id: deviceId,
      name: deviceId.split('_')[1],
      model: deviceId.split('_')[0],
      error: '無法讀取設備詳情'
    };
  }
};

/**
 * 計算設備的數據記錄總數
 * @param {string} signalLogPath - 信號日誌目錄路徑
 * @returns {Promise<number>} 記錄總數估計
 */
const countTotalRecords = async (signalLogPath) => {
  try {
    let total = 0;
    const dateDirs = await fs.readdir(signalLogPath);
    
    // 為了效率，我們只計算最近5天的
    const recentDays = dateDirs.sort((a, b) => b.localeCompare(a)).slice(0, 5);
    
    for (const dateDir of recentDays) {
      const dirPath = path.join(signalLogPath, dateDir);
      const files = await fs.readdir(dirPath);
      total += files.length; // 假設每個文件是一條記錄
    }
    
    // 如果有超過5天的數據，用平均數乘以總天數估算
    if (dateDirs.length > 5) {
      const avgPerDay = total / recentDays.length;
      total = Math.round(avgPerDay * dateDirs.length);
    }
    
    return total;
  } catch (error) {
    logger.error(`計算記錄數錯誤: ${error.message}`);
    return 0;
  }
};

module.exports = {
  getAllDevices,
  getDeviceInfo
};
