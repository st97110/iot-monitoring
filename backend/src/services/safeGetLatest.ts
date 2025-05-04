// services/safeDataService.ts
import { enrichRainfall, getLatestDataFromDB, getLatestDataFromFolder } from './dataService';
import { logger } from '../utils/logger';

export type SourceKey = 'wise' | 'tdr' | 'both';

/**
 * 優先從 DB 查詢最新數據，若失敗或為空，自動 fallback 資料夾
 * @param source 指定資料來源 'wise'、'tdr' 或 'both'
 * @param deviceId 可選，設備 ID
 */
export async function safeGetLatestData(source: SourceKey, deviceId?: string): Promise<Record<string, any>> {
  if (source === 'both') {
    // 分別查 wise 和 tdr，然後合併
    const [wiseLatest, tdrLatest] = await Promise.all([
      safeGetLatestData('wise', deviceId),
      safeGetLatestData('tdr', deviceId)
    ]);
    console.log("合併wise", wiseLatest);
    console.log("合併tdr", tdrLatest);
    const result = { ...wiseLatest, ...tdrLatest };
    await enrichRainfall(result, '10m');
    return result;
  }

  try {
    const dbResult = await getLatestDataFromDB(source, deviceId);
    const result   = (Object.keys(dbResult).length > 0)
                       ? dbResult
                       : await getLatestDataFromFolder(source, deviceId);
    await enrichRainfall(result, '10m');
    return result;
  } catch (error: any) {
    logger.error(`[safeGetLatestData] DB 查詢 ${deviceId}(${source}) 失敗: ${error.message}，改從資料夾讀取`);
    const result = await getLatestDataFromFolder(source, deviceId);
    await enrichRainfall(result, '10m');
    return result;
  }
}