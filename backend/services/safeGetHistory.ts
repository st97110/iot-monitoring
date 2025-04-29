import { getHistoryDataFromDB, getHistoryDataFromFolder } from './dataService';
import { safeGetDevices } from './safeGetDevices';
import { logger } from '../utils/logger';

export type SourceKey = 'wise' | 'tdr';

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
  endDate: string
): Promise<any[]> {
  try {
    const dbResult = await getHistoryDataFromDB(source, deviceId, startDate, endDate);

    if (dbResult[deviceId] && Array.isArray(dbResult[deviceId]) && dbResult[deviceId].length > 0) {
      return dbResult[deviceId];
    } else {
      logger.warn(`[SafeGetHistoryData] DB 查詢 ${deviceId}(${source}) 無資料，改從資料夾讀取`);
      return await getHistoryDataFromFolder(deviceId, startDate, endDate, source);
    }
  } catch (error: any) {
    logger.error(`[SafeGetHistoryData] DB 查詢 ${deviceId}(${source}) 失敗: ${error.message}，改從資料夾讀取`);
    return await getHistoryDataFromFolder(deviceId, startDate, endDate, source);
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
  endDate: string
): Promise<any[]> {
  try {
    const devices = await safeGetDevices(source);

    const allResults: any[] = [];

    for (const device of devices) {
      try {
        const history = await safeGetHistoryData(source, device.id, startDate, endDate);
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