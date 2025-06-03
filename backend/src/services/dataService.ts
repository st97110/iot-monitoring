import fs from 'fs-extra';
import path from 'path';
import { queryLatestDataFromInflux, queryDeviceListFromInflux, queryHistoryDataFromInflux, queryRainfall } from './influxClientService';
import { parseWiseCSVFile } from '../utils/parser';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { isDeviceRainGauge } from '../utils/helper';

type SourceKey = 'wise' | 'tdr';

export type RainDuration = string | number;   // e.g. "30m" | 60 | "6h" | "1d"

// 內存緩存，存儲每個設備的最新數據
const latestDataCache: Map<string, any> = new Map();

function getBaseFolder(source: SourceKey): string {
  return source === 'wise' ? config.folder.wiseBackupDir : config.folder.tdrBackupDir;
}

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
    const [y, mo, d, h, mi, s] = [
      fileTimePart.slice(0, 4), fileTimePart.slice(4, 6), fileTimePart.slice(6, 8),
      fileTimePart.slice(8, 10), fileTimePart.slice(10, 12), fileTimePart.slice(12, 14)
    ].map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    // Date.UTC(...) 會回傳 UTC 時間的時間戳 (ms)，再用 new Date() 包一層就不會受本地時區影響
  }
  else {
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

//#region From Folder

/**
 * 取得所有設備的最新數據或指定設備的最新數據
 * @param deviceId 可選，設備 ID
 * @returns 最新數據
 */
export async function getLatestDataFromFolder(source: SourceKey, deviceId?: string): Promise<any> {
  // TODO: 支援 deviceId 可選，目前僅支援單一設備，待完善
  // 實作方式為讀取最新日期的資料夾內的所有檔案，比照 getLatestDataFromDB()
  // try {
  //   const cacheKey = `${source}:${deviceId}`;

  //   if (latestDataCache.has(cacheKey)) {
  //     return latestDataCache.get(cacheKey);
  //   }

  //   const baseDir = getBaseFolder(source);
  //   let devicePath = baseDir;
  //   if (deviceId)
  //     deviceId = path.join(baseDir, deviceId);

  //   if (!await fs.pathExists(devicePath)) {
  //     throw new Error(`設備 ${deviceId} 不存在`);
  //   }

  //   const dateDirs = await getSortedEntries(devicePath);
  //   if (!dateDirs.length) throw new Error(`設備 ${deviceId} 沒有任何資料夾`);

  //   const latestDateDir = path.join(devicePath, dateDirs[0]);
  //   const files = await getSortedEntries(latestDateDir);
  //   if (!files.length) throw new Error(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何資料`);

  //   const latestFile = path.join(latestDateDir, files[0]);
  //   const data = await parseCSVFile(latestFile);

  //   if (!data.length) throw new Error(`設備 ${deviceId} 的最新資料檔案為空`);

  //   // 存入快取
  //   latestDataCache.set(cacheKey, data[0]);
  //   return data[0];
  // } catch (error: any) {
  //   logger.error(`讀取設備 ${deviceId} 最新資料錯誤: ${error.message}`);
  //   throw error;
  // }
}



/**
 * 取得特定設備在日期範圍內的歷史數據
 * @param deviceId 設備 ID
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 * @param source 資料來源 ('wise' | 'tdr')
 * @returns 歷史數據列表
 */
export async function getHistoryDataFromFolder(deviceId: string, startDate: string, endDate: string, source: SourceKey): Promise<any[]> {
  try {
    const baseDir = getBaseFolder(source);
    const devicePath = path.join(baseDir, deviceId);
    if (!await fs.pathExists(devicePath)) {
      logger.warn(`設備 ${deviceId} 在 ${baseDir} 不存在`);
      return [];
    }

    const dateList = formatDateList(startDate, endDate);
    const existingDirs = await fs.readdir(devicePath);
    const targetDirs = dateList.filter(d => existingDirs.includes(d));

    const allData: any[] = [];

    for (const dateDir of targetDirs) {
      const dirPath = path.join(devicePath, dateDir);
      if (!await fs.pathExists(dirPath)) continue;

      const files = await getSortedEntries(dirPath, false); // 升冪
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const records = await parseWiseCSVFile(filePath);
          for (const record of records) {
            record.deviceId = deviceId; // 加上 deviceId
            allData.push(record);
          }
        } catch (error: any) {
          logger.error(`讀取 ${filePath} 錯誤: ${error.message}`);
        }
      }
    }

    return allData;
  } catch (error: any) {
    logger.error(`讀取設備 ${deviceId} 歷史數據錯誤: ${error.message}`);
    throw error;
  }
}

/**
 * 根據設備 ID 與當前記錄 timestamp，尋找歷史資料中最新的、且 timestamp 小於當前記錄的那筆數據
 * @param deviceId 設備 ID
 * @param currentTimestamp 當前數據的 timestamp
 * @returns 前一筆記錄，若找不到則為 undefined
 */
export async function findPreviousRecordFromFolder(
  deviceId: string,
  currentTimestamp: string,
  source: SourceKey
): Promise<any | undefined> {
  try {
    const baseDir = getBaseFolder(source);
    const devicePath = path.join(baseDir, deviceId);
    if (!await fs.pathExists(devicePath)) return undefined;

    const dateDirs = await getSortedEntries(devicePath, true); // ⬅️ 新的在前，方便 early return
    if (!dateDirs.length) return undefined;

    const currentDateObj = new Date(currentTimestamp);
    const currentDateString = currentDateObj.toISOString().slice(0, 10).replace(/-/g, '');

    const candidateDirs = dateDirs.filter(d => d <= currentDateString);

    for (const dir of candidateDirs) {
      const dirPath = path.join(devicePath, dir);
      if (!await fs.pathExists(dirPath)) continue;

      const files = await getSortedEntries(dirPath, true); // ⬅️ 新的在前
      for (const filename of files) {
        const fileTimestamp = parseFileTimestamp(filename, dir);
        if (fileTimestamp < currentDateObj) {
          const filePath = path.join(dirPath, filename);
          const records = await parseWiseCSVFile(filePath);
          if (records.length) return records[0];
        }
      }
    }

    return undefined;
  } catch (error: any) {
    logger.error(`findPreviousRecordFromFolder error (${deviceId}, ${source}): ${error.message}`);
    return undefined;
  }
}

/**
 * 更新最新數據緩存並計算雨量筒的十分鐘雨量
 * 利用 findPreviousRecordFromFolder 查找前一筆記錄以確定是否真的是首次出現
 * @param deviceId 設備 ID
 * @param data 最新數據
 * @returns void
 */
export async function updateLatestDataCache(deviceId: string, data: any): Promise<void> {
  let prevRecord = latestDataCache.get(deviceId);
  
  // 若緩存資料不存在或 timestamp 不早於當前記錄，透過 findPreviousRecordFromFolder 查詢歷史資料
  if (!prevRecord || new Date(prevRecord.timestamp) >= new Date(data.timestamp)) {
    prevRecord = await findPreviousRecordFromFolder(deviceId, data.timestamp, data.source);
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

//#endregion

//#region InfluxDB

/**
 * 查詢 InfluxDB 最新資料
 * @param source 指定資料來源：'wise'、'tdr'
 * @param deviceId 可選，指定設備 ID
 * @returns  Equipment ID => Latest Data
 * @throws  InfluxDB 查詢失敗
 */
export async function getLatestDataFromDB(source: 'wise' | 'tdr', deviceId?: string): Promise<Record<string, any>> {
  try {
    if (deviceId) {
      const data = await queryLatestDataFromInflux(source, deviceId);
      return { [deviceId]: data };
    }

    const deviceIds = await queryDeviceListFromInflux(source);
    const result: Record<string, any> = {};

    for (const id of deviceIds) {
      try {
        result[id] = await queryLatestDataFromInflux(source, id);
      } catch (err: any) {
        result[id] = { error: err.message };
      }
    }

    return result;
  } catch (err: any) {
    logger.error(`[InfluxDB] 查詢最新資料失敗: ${err.message}`);
    throw err;
  }
}

/**
 * 從 InfluxDB 查詢歷史資料
 * @param source 資料來源（wise 或 tdr）
 * @param deviceId 裝置 ID（可選）
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 */
export async function getHistoryDataFromDB(
  source: SourceKey,
  deviceId?: string,
  startDate?: string,
  endDate?: string,
  rainInterval?: string
): Promise<Record<string, any>> {
  try {
    const result: Record<string, any> = {};

    if (!startDate || !endDate) {
      throw new Error('必須提供 startDate 和 endDate');
    }

    if (deviceId) {
      const data = await queryHistoryDataFromInflux(source, deviceId, startDate, endDate, rainInterval);
      result[deviceId] = data;
      return result;
    }

    const deviceIds = await queryDeviceListFromInflux(source);
    for (const id of deviceIds) {
      try {
        result[id] = await queryHistoryDataFromInflux(source, id, startDate, endDate, rainInterval);
      } catch (err: any) {
        logger.warn(`[InfluxDB] 裝置 ${id} 查詢歷史資料錯誤: ${err.message}`);
        result[id] = { error: err.message };
      }
    }

    return result;
  } catch (err: any) {
    logger.error(`[InfluxDB] 查詢歷史資料失敗: ${err.message}`);
    throw err;
  }
}

/** 補上 rainfall 指定區間 (例如 30m、6h、24h) */
export async function enrichRainfall(
    dataRecordsInput: Record<string, any> | any[],
    // ✨ durations 參數現在可能更多是為了標記前端期望的欄位名，
    //    因為實際的聚合計算應該在 influxClientService 中完成
    requestedDurations: RainDuration[]
): Promise<void> {
    const entriesToProcess: [string, any][] = Array.isArray(dataRecordsInput)
        ? dataRecordsInput.map(record => {
          // 確保即使是陣列輸入，deviceId 也是明確的
          const deviceId = record?.deviceId || (Object.keys(record || {}).length === 1 ? Object.keys(record)[0] : undefined);
          return [deviceId, record];
        })
        : Object.entries(dataRecordsInput);

    for (const [deviceId, record] of entriesToProcess) {
      // 確保 record 是物件且有 deviceId
      if (typeof record !== 'object' || record === null || !isDeviceRainGauge(deviceId)) {
          continue;
      }
      
      for (const duration of requestedDurations) {
        const durationStr = typeof duration === 'number' ? `${duration}m` : duration;
        const rainfallFieldKey = `rainfall_${durationStr.replace(/\s+/g, '')}`; // e.g., rainfall_10m, rainfall_1h

        // logger.debug(`[EnrichRainfall] ${deviceId} 檢查 ${rainfallFieldKey}: ${record[rainfallFieldKey]}`);
        // 檢查 DB 返回的數據中是否已經有這個聚合值
        if (record[rainfallFieldKey] !== undefined && record[rainfallFieldKey] !== null) {
          // 如果 DB 返回的欄位名與前端期望的一致，或者我們在這裡做映射
          // 假設 DB 返回的聚合值欄位名就是 rainfall_1h, rainfall_10m 等
          // 確保值是數字
          const val = parseFloat(record[rainfallFieldKey]);
          if (!isNaN(val)) {
            record[rainfallFieldKey] = val;
            // logger.debug(`[EnrichRainfall] ${deviceId} 使用 DB 提供的 ${rainfallFieldKey}: ${val}`);
          } else {
            record[rainfallFieldKey] = null; // 設為 null 如果不是有效數字
          }
        } else {
          // ── 策略 B：即時計算 (適用於任何一種但預計算值不存在) ──
          try {
            const rain = await queryRainfall(deviceId, durationStr); // queryRainfall 接受 string | number
            // logger.debug(`[RainCalc] ${deviceId} (${durationStr}) 即時計算結果 = ${rain}`);
            if (rain !== null && !isNaN(rain)) { // 確保 rain 是有效數字
              record[rainfallFieldKey] = rain;
            } else {
              // logger.debug(`[RainCalc] ${deviceId} (${durationStr}) 即時計算無數據，設為 null。`);
              record[rainfallFieldKey] = null; // 或 0，取決於希望如何表示無數據
            }
          } catch (e: any) {
            logger.warn(`[RainCalc] ${deviceId} (${durationStr}) 即時計算失敗: ${e.message}`);
            record[rainfallFieldKey] = null;
          }

          // // ✨ 如果 DB 沒有返回預期的聚合欄位 (例如 rainfall_1h)
          // //    這表示 InfluxDB 的 aggregateWindow 查詢可能對該區間沒有數據
          // //    或者 Flux 查詢的 map 部分沒有正確映射欄位名
          // //    在這種情況下，我們將其設為 null，前端需要處理 null 值
          // logger.warn(`[EnrichRainfall] ${deviceId} 未從 DB 獲取到預期的聚合雨量欄位 ${rainfallFieldKey} (請求區間: ${durationStr})。 Record: %j`, record);
          // record[rainfallFieldKey] = null;
        }
      }
    }
}

//#endregion InfluxDB