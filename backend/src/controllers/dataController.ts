import { Request, Response, NextFunction } from 'express';
import { safeGetLatestData } from '../services/safeGetLatest';
import { safeGetDevices } from '../services/safeGetDevices';
import { safeGetHistoryData, safeGetAllHistoryData } from '../services/safeGetHistory';
import { logger } from '../utils/logger';
import { getSourceByDeviceId } from '../utils/helper';

// 創建一個類型，包含所有可能的 source key
type SourceKey = 'wise' | 'tdr' | 'both';

/**
 * 解析請求中的數據源。
 * 1. 優先使用前端明確指定的 `source` 參數。
 * 2. 如果沒有 `source` 但有 `deviceId`，則根據 `deviceId` 的模式或配置來推斷。
 * 3. 如果兩者都沒有，預設為查詢 'both'。
 * @param srcParam - 來自 req.query.source 的字串
 * @param deviceId - 來自 req.query.deviceId 的字串
 * @returns 'wise', 'tdr', 或 'both'
 */
function resolveSource(
  srcParam?: string,
  deviceId?: string
): SourceKey {
  // 1. 優先使用前端明確指定的 source 參數
  if (srcParam) {
    const key = srcParam.toLowerCase();
    if (key === 'wise' || key === 'tdr' || key === 'both') {
      return key as SourceKey;
    }
    // 如果傳了無效的 source，可以選擇忽略或返回預設值
    // 這裡我們選擇忽略，讓後續邏輯處理
  }

  // 2. 如果沒有有效的 source 參數，但有 deviceId，則根據 deviceId 推斷
  if (deviceId) {
    // ✨ 調用更新後的 getSourceByDeviceId，它能處理 'SN_' 等前綴
    const inferredSource = getSourceByDeviceId(deviceId); // 返回 'wise', 'tdr', 'geostar', 'unknown'

    // ✨ 將後端的詳細數據源類型 ('geostar') 映射回前端的通用數據源類型 ('wise')
    if (inferredSource === 'geostar') {
      return 'wise'; // ✨ 關鍵：告訴上層調用者，ETI 設備應該按照 'wise' 數據源的邏輯來處理查詢
    }
    if (inferredSource === 'wise' || inferredSource === 'tdr') {
      return inferredSource;
    }
    // 如果是 'unknown'，則讓後續邏輯決定
  }

  // 3. 如果既沒有有效的 source 參數，也沒有 deviceId，則預設為 'both'
  return 'both';
}

/* ----------------------------- 最新資料 ----------------------------- */
export async function getLatestData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const area = req.query.area as string | undefined;
    const deviceId = req.query.deviceId as string | undefined;
    const src = resolveSource(req.query.source as string | undefined, deviceId);

    let data: Record<string, any> = {};

    if (area && !deviceId) {
      // 先找出這個區所有裝置
      const ids = (await safeGetDevices(src))
                  .filter(d => d.area === area)
                  .map(d => d.id);

      // 逐台查詢並合併
      for (const id of ids) {
        Object.assign(data, await safeGetLatestData(src, id));
      }
    } else {
      data = await safeGetLatestData(src, deviceId);
    }
    res.json(data);
  } catch (err: any) {
    logger.error(`獲取最新數據錯誤: ${err.message}`);
    next(err);
  }
}

/* ----------------------------- 歷史資料 ----------------------------- */
export async function getHistoryData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { deviceId, startDate, endDate, rainInterval = '10m' } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: '缺少 startDate 或 endDate' });
      return;
    }

    // 時間順序自動修正
    let sDate = startDate as string;
    let eDate = endDate as string;
    if (new Date(sDate) > new Date(eDate)) [sDate, eDate] = [eDate, sDate];

    const src = resolveSource(req.query.source as string | undefined, deviceId as string | undefined);   // ← 共用解析

    const data = deviceId
      ? await safeGetHistoryData(src, deviceId as string, sDate, eDate, rainInterval as string)
      : await safeGetAllHistoryData(src, sDate, eDate, rainInterval as string);

    res.json(data);
  } catch (err: any) {
    logger.error(`取得歷史資料錯誤: ${err.message}`);
    next(err);
  }
}
