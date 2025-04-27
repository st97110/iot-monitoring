import { Request, Response, NextFunction } from 'express';
import { getLatestDataFromInflux, getHistoryDataFromInflux } from '../services/dataService';
import { logger } from '../utils/logger';

// 獲取所有儀器的最新數據
export async function getLatestData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceId = req.query.deviceId as string;
    const data = await getLatestDataFromInflux(deviceId);
    res.json(data);
  } catch (error: any) {
    logger.error(`獲取最新數據錯誤: ${error.message}`);
    next(error);
  }
}

// 獲取特定儀器在日期區間內的歷史數據
export async function getHistoryData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId, startDate, endDate, limit, offset } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: '缺少 startDate 或 endDate' });
      return;
    }

    const history = await getHistoryDataFromInflux(
      deviceId as string,
      startDate as string,
      endDate as string,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined
    );

    res.json(history);
  } catch (error: any) {
    logger.error(`取得歷史資料錯誤: ${error.message}`);
    next(error);
  }
}

module.exports = {
  getLatestData,
  getHistoryData
};
