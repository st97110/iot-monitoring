import fs from 'fs-extra';
import path from 'path';
import { DeviceInfo, getAllDevices } from './deviceService';
import { csvParser } from '../utils/csvParser';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// 內存緩存，存儲每個設備的最新數據
const latestDataCache: Map<string, any> = new Map();

/** 
 * Helper: 取得目錄下的子目錄或檔案，並排序
 * @param dir 目錄路徑
 * @param descending 是否降序，預設為 true
 * @returns 排序後的檔案或目錄名稱陣列
 */
async function getSortedEntries(dir: string, descending = true): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return descending 
    ? entries.sort((a, b) => b.localeCompare(a))  // 降序
    : entries.sort((a, b) => a.localeCompare(b)); // 升序
}

/** 
 * Helper: 產生 YYYYMMDD 格式的日期清單（包含 startDate 與 endDate）
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 * @returns 日期字串陣列 (YYYYMMDD 格式)
 */
function formatDateList(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  
  const list: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    list.push(current.toISOString().slice(0, 10).replace(/-/g, ''));
    current.setDate(current.getDate() + 1);
  }
  return list;
}

/**
 * Helper: 從檔案名稱解析為日期物件
 * @param filename 檔案名稱（格式為 YYYYMMDDhhmmss.csv）
 * @param dateDir 日期目錄（格式為 YYYYMMDD）
 * @returns 日期物件
 */
function parseFileTimestamp(filename: string, dateDir: string): Date {
  const fileTimePart = filename.split('.')[0];

  // 如果是 14 碼 YYYYMMDDhhmmss
  if (fileTimePart.length === 14) {
    const year   = Number(fileTimePart.slice(0, 4));
    const month  = Number(fileTimePart.slice(4, 6)) - 1; // 月份從 0 開始
    const day    = Number(fileTimePart.slice(6, 8));
    const hour   = Number(fileTimePart.slice(8, 10));
    const minute = Number(fileTimePart.slice(10, 12));
    const second = Number(fileTimePart.slice(12, 14));
    // Date.UTC(...) 會回傳 UTC 時間的時間戳 (ms)，再用 new Date() 包一層就不會受本地時區影響
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  } else {
    // fallback: 如果只有 dateDir + time 部分，也一樣用 UTC
    const [yyyy, MM, dd] = [dateDir.slice(0,4), dateDir.slice(4,6), dateDir.slice(6,8)].map(Number);
    const [hh, mm, ss]   = [
      fileTimePart.slice(0,2),
      fileTimePart.slice(2,4),
      fileTimePart.slice(4,6)
    ].map(Number);

    return new Date(Date.UTC(yyyy, MM - 1, dd, hh, mm, ss));
  }
}

/**
 * Helper: 計算雨量筒的十分鐘雨量
 * @param currentData 當前數據
 * @param previousData 前一筆數據
 */
function calculateRainfall(currentData: any, previousData: any): void {
  if (currentData?.raw?.['DI_0 Cnt'] !== undefined) {
    const currentCount = parseFloat(currentData.raw['DI_0 Cnt'].trim());
    
    const prevCount = previousData?.raw?.['DI_0 Cnt'] !== undefined
      ? parseFloat(previousData.raw['DI_0 Cnt'].trim())
      : 0;
    
    const delta = currentCount >= prevCount ? (currentCount - prevCount) : currentCount;
    currentData.rainfall10Min = delta / 2;
  }
}

/**
 * 取得所有設備的最新數據或指定設備的最新數據
 * @param deviceId 可選，設備 ID
 * @returns 最新數據
 */
export async function getLatestData(deviceId?: string): Promise<Record<string, any>> {
  try {
    if (deviceId) {
      // 檢查設備目錄是否存在
      const devicePath = path.join(config.dataDir, deviceId);
      if (!await fs.pathExists(devicePath)) throw new Error(`設備 ${deviceId} 不存在`);
      if (latestDataCache.has(deviceId)) return { [deviceId]: latestDataCache.get(deviceId) };
      const latestData = await readLatestDeviceData(deviceId);
      return { [deviceId]: latestData };
    }
    // 取得所有設備的最新數據
    const devices: DeviceInfo[] = await getAllDevices();
    const result: Record<string, any> = {};
    for (const device of devices) {
      const id = device.id;
      if (latestDataCache.has(id)) {
        result[id] = latestDataCache.get(id);
      } else {
        try {
          const latestData = await readLatestDeviceData(id);
          result[id] = latestData;
        } catch (error: any) {
          logger.error(`讀取設備 ${id} 最新數據錯誤: ${error.message}`);
          result[id] = { error: '無法讀取最新數據' };
        }
      }
    }
    return result;
  } catch (error: any) {
    logger.error(`獲取最新數據錯誤: ${error.message}`);
    throw error;
  }
}

/**
 * 讀取特定設備的最新數據
 * @param deviceId 設備 ID
 * @returns 最新數據
 */
async function readLatestDeviceData(deviceId: string): Promise<any> {
  try {
    const signalLogPath = path.join(config.dataDir, deviceId, 'signal_log');
    if (!await fs.pathExists(signalLogPath)) {
      throw new Error(`設備 ${deviceId} 的信號日誌目錄不存在`);
    }

    const dateDirs = await getSortedEntries(signalLogPath);
    if (!dateDirs.length) throw new Error(`設備 ${deviceId} 沒有任何數據`);

    const latestDateDir = path.join(signalLogPath, dateDirs[0]);
    const files = await getSortedEntries(latestDateDir);
    if (!files.length) throw new Error(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何數據文件`);

    const latestFile = path.join(latestDateDir, files[0]);
    const data = await csvParser.parseCSVFile(latestFile);
    if (!data.length) throw new Error(`設備 ${deviceId} 的最新數據文件為空`);

    latestDataCache.set(deviceId, data[0]);
    return data[0];
  } catch (error: any) {
    logger.error(`讀取設備 ${deviceId} 最新數據錯誤: ${error.message}`);
    throw error;
  }
}

/**
 * 取得特定設備在日期範圍內的歷史數據
 * @param deviceId 設備 ID
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 * @returns 歷史數據列表
 */
export async function getHistoryData(deviceId: string, startDate: string, endDate: string): Promise<any[]> {
  try {
    const devices = deviceId ? [{ id: deviceId }] : await getAllDevices();
    const allData: any[] = [];
    const dateList = formatDateList(startDate, endDate);

    for (const { id } of devices) {
      const signalLogPath = path.join(config.dataDir, id, 'signal_log');
      if (!await fs.pathExists(signalLogPath)) continue;

      const existingDirs = await fs.readdir(signalLogPath);
      const targetDirs = dateList.filter(d => existingDirs.includes(d));

      for (const dateDir of targetDirs) {
        const dirPath = path.join(signalLogPath, dateDir);
        const files = await getSortedEntries(dirPath, false); // 升序排列
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            const data = await csvParser.parseCSVFile(filePath);
            for (const record of data) {
              record.deviceId = id; // 加入來源設備 ID
              allData.push(record);
            }
          } catch (error: any) {
            logger.error(`讀取 ${filePath} 錯誤: ${error.message}`);
          }
        }
      }
    }

    return allData;
  } catch (error: any) {
    logger.error(`獲取歷史數據錯誤: ${error.message}`);
    throw error;
  }
}

/**
 * 根據設備 ID 與當前記錄 timestamp，尋找歷史資料中最新的、且 timestamp 小於當前記錄的那筆數據
 * @param deviceId 設備 ID
 * @param currentTimestamp 當前數據的 timestamp
 * @returns 前一筆記錄，若找不到則為 undefined
 */
export async function findPreviousRecord(deviceId: string, currentTimestamp: string): Promise<any | undefined> {
  try {
    const signalLogPath = path.join(config.dataDir, deviceId, 'signal_log');
    if (!await fs.pathExists(signalLogPath)) return undefined;

    const dateDirs = await getSortedEntries(signalLogPath);
    if (!dateDirs.length) return undefined;

    const currentDateObj = new Date(currentTimestamp);
    const currentDateString = currentDateObj.toISOString().slice(0, 10).replace(/-/g, '');
    const candidateDirs = dateDirs.filter(d => d <= currentDateString);

    for (const dir of candidateDirs) {
      const dirPath = path.join(signalLogPath, dir);
      const files = await getSortedEntries(dirPath);
      
      for (const filename of files) {
        const fileTimestamp = parseFileTimestamp(filename, dir);
        
        if (fileTimestamp < currentDateObj) {
          const filePath = path.join(dirPath, filename);
          const records = await csvParser.parseCSVFile(filePath);
          if (records.length) return records[0];
        }
      }
    }

    return undefined;
  } catch (error: any) {
    logger.error(`findPreviousRecord error for device ${deviceId}: ${error.message}`);
    return undefined;
  }
}

/**
 * 更新最新數據緩存並計算雨量筒的十分鐘雨量
 * 利用 findPreviousRecord 查找前一筆記錄以確定是否真的是首次出現
 * @param deviceId 設備 ID
 * @param data 最新數據
 * @returns void
 */
export async function updateLatestDataCache(deviceId: string, data: any): Promise<void> {
  let prevRecord = latestDataCache.get(deviceId);
  
  // 若緩存資料不存在或 timestamp 不早於當前記錄，透過 findPreviousRecord 查詢歷史資料
  if (!prevRecord || new Date(prevRecord.timestamp) >= new Date(data.timestamp)) {
    prevRecord = await findPreviousRecord(deviceId, data.timestamp);
  }
  
  // 計算雨量
  calculateRainfall(data, prevRecord);
  
  // 更新緩存
  latestDataCache.set(deviceId, data);
}

/**
 * 清除緩存：若提供 deviceId 則僅清除此設備的緩存，否則清空所有緩存
 * @param deviceId 可選，設備 ID
 * @returns void
 */
export function clearCache(deviceId?: string): void {
  if (deviceId) {
    latestDataCache.delete(deviceId);
  } else {
    latestDataCache.clear();
  }
}