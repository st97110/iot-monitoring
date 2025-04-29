import { Request, Response, NextFunction } from 'express';
import { safeGetLatestData } from '../services/safeGetData';
import { safeGetHistoryData, safeGetAllHistoryData } from '../services/safeGetHistory';
import { logger } from '../utils/logger';

// 🔸 共用：把字串轉成 'wise' | 'tdr' | 'both'
function parseSource(src?: string): 'wise' | 'tdr' | 'both' {
  switch ((src ?? '').toLowerCase()) {
    case 'wise':
      return 'wise';
    case 'tdr':
      return 'tdr';
    case 'both':
      return 'both';
    default:
      return 'both';          // getLatest 預設 both
  }
}

/* ----------------------------- 最新資料 ----------------------------- */
export async function getLatestData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const deviceId = req.query.deviceId as string | undefined;
    const src = parseSource(req.query.source as string | undefined);

    const data = await safeGetLatestData(src, deviceId);               // ← 傳進去

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

    const src = parseSource(req.query.source as string | undefined);   // ← 共用解析

    const data = deviceId
      ? await safeGetHistoryData(src, deviceId as string, sDate, eDate)
      : await safeGetAllHistoryData(src, sDate, eDate);

    res.json(data);
  } catch (err: any) {
    logger.error(`取得歷史資料錯誤: ${err.message}`);
    next(err);
  }
}
