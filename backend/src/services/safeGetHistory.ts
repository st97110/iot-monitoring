// services/safeGetHistory.ts
import { RainDuration, enrichRainfall, getHistoryDataFromDB, getHistoryDataFromFolder } from './dataService';
import { safeGetDevices } from './safeGetDevices';
import { logger } from '../utils/logger';
import { isDeviceRainGauge } from '../utils/helper';

export type SourceKey = 'wise' | 'tdr' | 'both';

/**
 * 優先從 DB 查詢歷史資料，若失敗或無資料，自動 fallback 資料夾
 * @param source 指定來源 'wise'、'tdr' 或 'both'
 * @param deviceId 裝置 ID
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 */
export async function safeGetHistoryData(
  source: SourceKey,
  deviceId: string,
  startDate: string,
  endDate: string,
  rainInterval: string
): Promise<any[]> {
  const rainfallDurationsForEnrich: RainDuration[] = [rainInterval as RainDuration];

  if (source === 'both') {
    const [wise, tdr] = await Promise.all([
      safeGetHistoryData('wise', deviceId, startDate, endDate, rainInterval),
      safeGetHistoryData('tdr', deviceId, startDate, endDate, rainInterval)
    ]);

    const result = [...wise, ...tdr];
    
    if (isDeviceRainGauge(deviceId)) {
      await enrichRainfall(result.filter(r => r.deviceId === deviceId && r.source === 'wise'), rainfallDurationsForEnrich);
    }
    return result;
  }

  try {
    // ✨ 將 rainInterval 傳遞給 getHistoryDataFromDB
    const historyDataMap = await getHistoryDataFromDB(source, deviceId, startDate, endDate, rainInterval);
    let resultDataArray: any[] = [];

    if (historyDataMap && historyDataMap[deviceId] && Array.isArray(historyDataMap[deviceId])) {
      resultDataArray = historyDataMap[deviceId];
      if (resultDataArray.length > 0) {
        logger.debug(`[SafeGetHistoryData] 從 DB 獲取到 ${deviceId} 的 ${resultDataArray.length} 筆歷史數據 (區間: ${rainInterval})。`);
      }
    }

    if (resultDataArray.length === 0) { // 如果DB沒數據或返回空
      logger.warn(`[SafeGetHistoryData] DB 查詢 ${deviceId}(${source}, interval: ${rainInterval}) 無有效歷史數據，改從資料夾讀取。`);
      resultDataArray = await getHistoryDataFromFolder(deviceId, startDate, endDate, source);
      if (resultDataArray.length > 0) {
        logger.debug(`[SafeGetHistoryData] 從資料夾獲取到 ${deviceId} 的 ${resultDataArray.length} 筆歷史數據。`);
      } else {
        logger.warn(`[SafeGetHistoryData] 資料夾中也未找到 ${deviceId}(${source}) 的歷史數據。`);
      }
    }
    
    // ✨ 只有當 source 是 'wise' 且 deviceId 是雨量筒時才 enrich
    if (source === 'wise' && isDeviceRainGauge(deviceId)) {
      await enrichRainfall(resultDataArray, rainfallDurationsForEnrich);
    }
    return resultDataArray;

  } catch (error: any) {
    logger.error(`[SafeGetHistoryData] DB 查詢 ${deviceId}(${source}, interval: ${rainInterval}) 失敗: ${error.message}，嘗試資料夾 fallback。`);
    const result = await getHistoryDataFromFolder(deviceId, startDate, endDate, source);
    if (source === 'wise' && isDeviceRainGauge(deviceId)) {
      await enrichRainfall(result, rainfallDurationsForEnrich);
    }
    return result;
  }
}

/**
 * 查詢所有設備的歷史資料（支援 fallback）
 * @param source 'wise' | 'tdr' | 'both'
 * @param startDate 開始日期 (YYYY-MM-DD)
 * @param endDate 結束日期 (YYYY-MM-DD)
 */
export async function safeGetAllHistoryData(
  source: SourceKey,
  startDate: string,
  endDate: string,
  rainInterval: string
): Promise<any[]> {
  if (source === 'both') {
    const [wise, tdr] = await Promise.all([
      safeGetAllHistoryData('wise', startDate, endDate, rainInterval),
      safeGetAllHistoryData('tdr', startDate, endDate, rainInterval)
    ]);
    return [...wise, ...tdr];
  }
  try {
    const devices = await safeGetDevices(source);
    const allResults: any[] = [];

    for (const device of devices) {
      try {
        const history = await safeGetHistoryData(source, device.id, startDate, endDate, rainInterval);
        allResults.push(...history);
      } catch (error: any) {
        logger.error(`[safeGetAllHistoryData] 裝置 ${device.id} 查詢錯誤: ${error.message}`);
      }
    }
    return allResults;
  } catch (error: any) {
    logger.error(`[safeGetAllHistoryData] 查詢全部歷史資料失敗: ${error.message}`);
    throw error;
  }
}