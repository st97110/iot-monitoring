const fs = require('fs-extra');
const path = require('path');
const deviceService = require('./deviceService');
const csvParser = require('../utils/csvParser');
const { DATA_DIR } = require('../config/config');
const logger = require('../utils/logger');

// 內存緩存，存儲每個設備的最新數據
const latestDataCache = new Map();

/**
 * 取得所有設備的最新數據或特定設備的最新數據
 * @param {string} deviceId - 可選的設備ID
 * @returns {Promise<Object|Array>} 最新數據
 */
const getLatestData = async (deviceId) => {
  try {
    // 如果指定了設備ID，只返回該設備的數據
    if (deviceId) {
      // 先檢查設備是否存在
      const devicePath = path.join(DATA_DIR, deviceId);
      const exists = await fs.pathExists(devicePath);
      if (!exists) {
        throw new Error(`設備 ${deviceId} 不存在`);
      }

      // 檢查緩存是否有最新數據
      if (latestDataCache.has(deviceId)) {
        return { [deviceId]: latestDataCache.get(deviceId) };
      }

      // 如果緩存中沒有，讀取最新數據
      const latestData = await readLatestDeviceData(deviceId);
      return { [deviceId]: latestData };
    }

    // 否則獲取所有設備的最新數據
    const devices = await deviceService.getAllDevices();
    const result = {};

    for (const device of devices) {
      // 檢查緩存
      if (latestDataCache.has(device.id)) {
        result[device.id] = latestDataCache.get(device.id);
        continue;
      }

      try {
        const latestData = await readLatestDeviceData(device.id);
        result[device.id] = latestData;
      } catch (error) {
        logger.error(`讀取設備 ${device.id} 最新數據錯誤: ${error.message}`);
        result[device.id] = { error: '無法讀取最新數據' };
      }
    }

    return result;
  } catch (error) {
    logger.error(`獲取最新數據錯誤: ${error.message}`);
    throw error;
  }
};

/**
 * 讀取特定設備的最新數據
 * @param {string} deviceId - 設備ID
 * @returns {Promise<Object>} 設備最新數據
 */
const readLatestDeviceData = async (deviceId) => {
  try {
    const signalLogPath = path.join(DATA_DIR, deviceId, 'signal_log');
    const exists = await fs.pathExists(signalLogPath);
    
    if (!exists) {
      throw new Error(`設備 ${deviceId} 的信號日誌目錄不存在`);
    }

    // 獲取所有日期目錄，按降序排列
    const dateDirs = await fs.readdir(signalLogPath);
    dateDirs.sort((a, b) => b.localeCompare(a));

    if (dateDirs.length === 0) {
      throw new Error(`設備 ${deviceId} 沒有任何數據`);
    }

    // 獲取最新日期目錄
    const latestDateDir = path.join(signalLogPath, dateDirs[0]);
    
    // 獲取該日期下的所有文件，按降序排列
    const files = await fs.readdir(latestDateDir);
    files.sort((a, b) => b.localeCompare(a));

    if (files.length === 0) {
      throw new Error(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何數據文件`);
    }

    // 獲取最新的CSV文件
    const latestFile = path.join(latestDateDir, files[0]);
    
    // 解析CSV文件
    const data = await csvParser.parseCSVFile(latestFile);
    
    // 更新緩存
    if (data.length > 0) {
      latestDataCache.set(deviceId, data[0]);
      return data[0];
    } else {
      throw new Error(`設備 ${deviceId} 的最新數據文件為空`);
    }
  } catch (error) {
    logger.error(`讀取設備 ${deviceId} 最新數據錯誤: ${error.message}`);
    throw error;
  }
};

/**
 * 獲取特定設備在日期範圍內的歷史數據
 * @param {string} deviceId - 設備ID
 * @param {string} startDate - 開始日期 (YYYY-MM-DD)
 * @param {string} endDate - 結束日期 (YYYY-MM-DD)
 * @returns {Promise<Array>} 歷史數據列表
 */
const getHistoryData = async (deviceId, startDate, endDate) => {
  try {
    const devices = deviceId ? [{ id: deviceId }] : await deviceService.getAllDevices();

    const allData = [];

    for (const { id } of devices) {
      const devicePath = path.join(DATA_DIR, id);
      const exists = await fs.pathExists(devicePath);
      if (!exists) continue;

      const signalLogPath = path.join(devicePath, 'signal_log');
      const signalLogExists = await fs.pathExists(signalLogPath);
      if (!signalLogExists) continue;

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

      const dateList = [];
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dateString = currentDate.toISOString().split('T')[0].replace(/-/g, '');
        dateList.push(dateString);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const existingDirs = await fs.readdir(signalLogPath);
      const targetDirs = dateList.filter(date => existingDirs.includes(date));
      if (targetDirs.length === 0) continue;

      for (const dateDir of targetDirs) {
        const dirPath = path.join(signalLogPath, dateDir);
        const files = await fs.readdir(dirPath);
        files.sort((a, b) => a.localeCompare(b));

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            const data = await csvParser.parseCSVFile(filePath);
            for (const record of data) {
              record.deviceId = id; // 加上來源設備ID
              allData.push(record);
            }
          } catch (error) {
            logger.error(`讀取 ${filePath} 錯誤: ${error.message}`);
          }
        }
      }
    }

    return allData;
  } catch (error) {
    logger.error(`獲取歷史數據錯誤: ${error.message}`);
    throw error;
  }
};


/**
 * 更新設備最新數據緩存
 * @param {string} deviceId - 設備ID
 * @param {Object} data - 最新數據
 */
const updateLatestDataCache = (deviceId, data) => {
  latestDataCache.set(deviceId, data);
};

/**
 * 清除特定設備的緩存或所有緩存
 * @param {string} deviceId - 可選的設備ID
 */
const clearCache = (deviceId) => {
  if (deviceId) {
    latestDataCache.delete(deviceId);
  } else {
    latestDataCache.clear();
  }
};

module.exports = {
  getLatestData,
  getHistoryData,
  updateLatestDataCache,
  clearCache
};
