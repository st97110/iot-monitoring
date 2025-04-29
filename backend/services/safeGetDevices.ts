import { getAllDevicesFromDB, getAllDevicesFromFolder } from './deviceService';
import { logger } from '../utils/logger';

type SourceKey = 'wise' | 'tdr' | 'both';

/**
 * 自動 fallback 查詢設備列表
 * @param source 指定資料來源：'wise'、'tdr'、'both'
 */
export async function safeGetDevices(source: SourceKey = 'both'): Promise<any[]> {
    if (source === 'both') {
        // 分別查 wise 和 tdr，然後合併
        const wiseDevices = await getAllDevicesFromFolder('wise');
        const tdrDevices = await getAllDevicesFromFolder('tdr');
        // 用 Set 去除重複 deviceId
        const merged = [...new Map(
            [...wiseDevices, ...tdrDevices].map(device => [device.id, device])
        ).values()];
        return merged;
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
