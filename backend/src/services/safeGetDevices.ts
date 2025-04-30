import { getAllDevicesFromDB, getAllDevicesFromFolder } from './deviceService';
import { logger } from '../utils/logger';

type SourceKey = 'wise' | 'tdr' | 'both';

/**
 * 自動 fallback 查詢設備列表
 * @param source 指定資料來源：'wise'、'tdr'、'both'
 */
export async function safeGetDevices(source: SourceKey): Promise<any[]> {
    if (source === 'both') {
        // ⚠️ 這裡改成再次呼叫自己，但傳入 'wise' / 'tdr'
        const [wiseDevices, tdrDevices] = await Promise.all([
          safeGetDevices('wise'),
          safeGetDevices('tdr')
        ]);
    
        // 合併並去重
        return [...new Map(
          [...wiseDevices, ...tdrDevices].map(d => [d.id, d])
        ).values()];
      }

    try {
        const dbDevices = await getAllDevicesFromDB(source);
        if (dbDevices.length > 0) {
            return dbDevices;
        } else {
            logger.warn(`DB 查詢 ${source} 設備列表為空，改從資料夾讀取`);
            return await getAllDevicesFromFolder(source);
        }
    } catch (error: any) {
        logger.error(`DB 查詢 ${source} 設備列表失敗，改從資料夾讀取: ${error.message}`);
        return await getAllDevicesFromFolder(source);
    }
}
