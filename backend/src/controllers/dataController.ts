import { Request, Response, NextFunction } from 'express';
import { safeGetLatestData } from '../services/safeGetLatest';
import { safeGetDevices } from '../services/safeGetDevices';
import { safeGetHistoryData, safeGetAllHistoryData } from '../services/safeGetHistory';
import { logger } from '../utils/logger';
import { getSourceByDeviceId } from '../utils/helper';

// 解析來源：若沒帶 source，但有 deviceId → 用 deviceId 判斷
function resolveSource(
  srcParam?: string,
  deviceId?: string
): 'wise' | 'tdr' | 'both' {
  // ① 前端還是可以選擇性帶 source；完全不帶時 srcParam 會是 undefined
  if (srcParam) {
    const key = srcParam.toLowerCase();
    if (key === 'wise' || key === 'tdr' || key === 'both') return key as any;
  }
  // ② 沒有 source 但有 deviceId → 交給 getSourceByDeviceId
  if (deviceId) return getSourceByDeviceId(deviceId);
  // ③ 連 deviceId 都沒有（例如抓全部或依區域）就回傳 both
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
    const { deviceId, startDate, endDate } = req.query;
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
      ? await safeGetHistoryData(src, deviceId as string, sDate, eDate)
      : await safeGetAllHistoryData(src, sDate, eDate);

    res.json(data);
  } catch (err: any) {
    logger.error(`取得歷史資料錯誤: ${err.message}`);
    next(err);
  }
}
