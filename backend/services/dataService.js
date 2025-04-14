const fs = require('fs-extra');
const path = require('path');
const deviceService = require('./deviceService');
const csvParser = require('../utils/csvParser');
const { DATA_DIR } = require('../config/config');
const logger = require('../utils/logger');

// 內存緩存，存儲每個設備的最新數據
const latestDataCache = new Map();

/**
 * 取得所有設備的最新數據或指定設備的最新數據
 * @param {string} deviceId - 可選，設備 ID
 * @returns {Promise<Object|Array>} 最新數據
 */
const getLatestData = async (deviceId) => {
  try {
    if (deviceId) {
      // 檢查設備目錄是否存在
      const devicePath = path.join(DATA_DIR, deviceId);
      const exists = await fs.pathExists(devicePath);
      if (!exists) {
        throw new Error(`設備 ${deviceId} 不存在`);
      }
      // 若緩存中有，直接回傳
      if (latestDataCache.has(deviceId)) {
        return { [deviceId]: latestDataCache.get(deviceId) };
      }
      // 否則讀取最新數據
      const latestData = await readLatestDeviceData(deviceId);
      return { [deviceId]: latestData };
    }
    // 取得所有設備的最新數據
    const devices = await deviceService.getAllDevices();
    const result = {};
    for (const device of devices) {
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
 * @param {string} deviceId - 設備 ID
 * @returns {Promise<Object>} 最新數據
 */
const readLatestDeviceData = async (deviceId) => {
  try {
    const signalLogPath = path.join(DATA_DIR, deviceId, 'signal_log');
    const exists = await fs.pathExists(signalLogPath);
    if (!exists) {
      throw new Error(`設備 ${deviceId} 的信號日誌目錄不存在`);
    }
    // 取得所有日期目錄，並以降序排列（較新的在前）
    const dateDirs = await fs.readdir(signalLogPath);
    dateDirs.sort((a, b) => b.localeCompare(a));
    if (dateDirs.length === 0) {
      throw new Error(`設備 ${deviceId} 沒有任何數據`);
    }
    // 取得最新日期目錄
    const latestDateDir = path.join(signalLogPath, dateDirs[0]);
    // 取得該日期下所有檔案，並以降序排列
    const files = await fs.readdir(latestDateDir);
    files.sort((a, b) => b.localeCompare(a));
    if (files.length === 0) {
      throw new Error(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何數據文件`);
    }
    const latestFile = path.join(latestDateDir, files[0]);
    const data = await csvParser.parseCSVFile(latestFile);
    if (data.length > 0) {
      // 將最新資料更新到緩存中
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
 * 取得特定設備在日期範圍內的歷史數據
 * @param {string} deviceId - 設備 ID
 * @param {string} startDate - 開始日期 (YYYY-MM-DD)
 * @param {string} endDate - 結束日期 (YYYY-MM-DD)
 * @returns {Promise<Array>} 歷史數據列表
 */
const getHistoryData = async (deviceId, startDate, endDate) => {
  try {
    // 若指定 deviceId，僅處理該設備；否則讀取所有設備
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
              record.deviceId = id; // 加入來源設備 ID
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
 * 根據設備 ID 與當前記錄 timestamp，尋找該設備在歷史資料中（信號日誌目錄）最新的、且 timestamp 小於當前記錄的那筆數據。
 * @param {string} deviceId - 設備 ID
 * @param {string} currentTimestamp - 當前數據的 timestamp
 * @returns {Promise<Object|undefined>} 符合條件的前一筆記錄，若無則回傳 undefined
 */
const findPreviousRecord = async (deviceId, currentTimestamp) => {
  try {
    const signalLogPath = path.join(DATA_DIR, deviceId, 'signal_log');
    const exists = await fs.pathExists(signalLogPath);
    if (!exists) return undefined;

    // 取得所有日期目錄（格式應為 YYYYMMDD）
    const dateDirs = await fs.readdir(signalLogPath);
    if (dateDirs.length === 0) return undefined;

    // 解析當前 timestamp 的日期部分，轉換為 YYYYMMDD 格式
    const currentDateObj = new Date(currentTimestamp);
    const currentDateString = currentDateObj.toISOString().split('T')[0].replace(/-/g, '');

    // 篩選出日期目錄小於或等於當前日期
    const candidateDirs = dateDirs.filter(dateDir => dateDir <= currentDateString);
    if (candidateDirs.length === 0) return undefined;

    // 按降序排序資料夾，較新的資料夾排在前
    candidateDirs.sort((a, b) => b.localeCompare(a));

    // 遍歷候選資料夾
    for (const dir of candidateDirs) {
      const dirPath = path.join(signalLogPath, dir);
      const files = await fs.readdir(dirPath);
      if (files.length === 0) continue;
      // 假設檔案名稱格式為 YYYYMMDDhhmmss.csv
      files.sort((a, b) => b.localeCompare(a));
      for (const filename of files) {
        // 從檔案名稱取出不含副檔名的部分
        const fileTimePart = filename.split('.')[0];

        // 檢查 fileTimePart 是否為 14 碼（YYYYMMDDhhmmss）
        let fileTimestampStr;
        if (fileTimePart.length === 14) {
          // 解析並格式化為 YYYY-MM-DDThh:mm:ss，例如 "20250405001855" 變成 "2025-04-05T00:18:55"
          const year = fileTimePart.substring(0, 4);
          const month = fileTimePart.substring(4, 6);
          const day = fileTimePart.substring(6, 8);
          const hour = fileTimePart.substring(8, 10);
          const minute = fileTimePart.substring(10, 12);
          const second = fileTimePart.substring(12, 14);
          fileTimestampStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        } else {
          // 若不符合 14 碼，則用原格式（可能需要其他處理）
          fileTimestampStr = `${dir}T${fileTimePart}`;
        }
        const fileTimestamp = new Date(fileTimestampStr);
        if (fileTimestamp < currentDateObj) {
          const filePath = path.join(dirPath, filename);
          const records = await csvParser.parseCSVFile(filePath);
          if (records.length > 0) {
            return records[0];
          }
        }
      }
    }
    return undefined;
  } catch (error) {
    logger.error(`findPreviousRecord error for device ${deviceId}: ${error.message}`);
    return undefined;
  }
};

/**
 * 更新最新數據緩存並計算雨量筒的十分鐘雨量
 * 利用 findPreviousRecord 查找前一筆記錄以確定是否真的是首次出現
 * @param {string} deviceId - 設備 ID
 * @param {Object} data - 最新數據
 */
const updateLatestDataCache = async (deviceId, data) => {
  // 如果 data 存在且 raw 物件中有 "DI_0 Cnt" 欄位，表示為雨量筒數據
  if (data && data.raw && data.raw['DI_0 Cnt'] !== undefined) {
    // 取得原始計數字串並去除空白
    const countStr = data.raw['DI_0 Cnt'].trim();
    // 轉換為浮點數作為當前計數值
    const currentCount = parseFloat(countStr);

    let prevRecord = latestDataCache.get(deviceId);
    // 若緩存資料不存在或 timestamp 不早於當前記錄，透過 findPreviousRecord 查詢歷史資料
    if (!prevRecord || new Date(prevRecord.timestamp) >= new Date(data.timestamp)) {
      prevRecord = await findPreviousRecord(deviceId, data.timestamp);
    }
    let delta = 0;
    if (prevRecord && prevRecord.raw && prevRecord.raw['DI_0 Cnt'] !== undefined) {
      // 從先前記錄中取得 DI_0 Cnt，並處理空白與轉換為數值
      const prevCount = parseFloat(prevRecord.raw['DI_0 Cnt'].trim());
      // 如果當前數值大於或等於先前數值，正常計算差值；否則認為計數器重置，直接採用當前數值
      delta = currentCount >= prevCount ? (currentCount - prevCount) : currentCount;
    } else {
      // 若未找到前筆記錄，則視為首次出現
      delta = currentCount;
    }
    // 每次計數代表 0.5 mm，因此十分鐘雨量為差值除以 2
    data.rainfall10Min = delta / 2;
  }
  // 更新緩存，不管是否計算雨量
  latestDataCache.set(deviceId, data);
};

/**
 * 清除緩存：若提供 deviceId 則僅清除此設備的緩存，否則清空所有緩存
 * @param {string} deviceId - 選用的設備 ID
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
