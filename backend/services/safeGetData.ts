// services/safeDataService.ts
import { getLatestDataFromDB, getLatestDataFromFolder } from './dataService';
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
    
    return { ...wiseLatest, ...tdrLatest };
  }

  try {
    const dbResult = await getLatestDataFromDB(source, deviceId);

    if (Object.keys(dbResult).length > 0) {
      return dbResult;
    } else {
      logger.warn(`DB 查詢 ${deviceId ?? '全部設備'} 最新數據結果為空，改從資料夾查詢`);
      const folderResult = await getLatestDataFromFolder(source, deviceId);
      return folderResult;
    }
  } catch (error: any) {
    logger.error(`從 DB 查詢 ${deviceId ?? '全部設備'} 最新數據失敗，嘗試從資料夾讀取: ${error.message}`);
    const folderResult = await getLatestDataFromFolder(source, deviceId);
    return folderResult;
  }
}
