import { Request, Response, NextFunction } from 'express';
import { getLatestDataFromInflux, getHistoryDataFromInflux } from '../services/dataService';
import { logger } from '../utils/logger';

/**
 * 獲取所有儀器的最新數據
 * @param {Request} req - 請求對象，包含查詢參數 deviceId
 * @param {Response} res - 響應對象，用於返回最新數據或錯誤信息
 * @param {NextFunction} next - 用於傳遞錯誤至下一個中間件
 */
export async function getLatestData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 從查詢參數中提取設備 ID
    const deviceId = req.query.deviceId as string;

    // 獲取最新數據
    const data = await getLatestDataFromInflux(deviceId);

    // 返回最新數據
    res.json(data);
  } catch (error: any) {
    // 錯誤處理
    logger.error(`獲取最新數據錯誤: ${error.message}`);
    next(error);
  }
}

/**
 * 獲取特定儀器在日期區間內的歷史數據
 * @param {Request} req - 請求對象，包含查詢參數 deviceId, startDate, endDate, limit, offset
 * @param {Response} res - 響應對象，用於返回歷史數據或錯誤信息
 * @param {NextFunction} next - 用於傳遞錯誤至下一個中間件
 */
export async function getHistoryData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 從查詢參數中提取設備 ID、開始和結束日期、限制和偏移量
    const { deviceId, startDate, endDate, limit, offset } = req.query;

    // 確保開始和結束日期存在，否則返回 400 錯誤
    if (!startDate || !endDate) {
      res.status(400).json({ error: '缺少 startDate 或 endDate' });
      return;
    }

    // 從 InfluxDB 獲取歷史數據
    const history = await getHistoryDataFromInflux(
      deviceId as string,
      startDate as string,
      endDate as string,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined
    );

    // 返回獲取到的歷史數據
    res.json(history);
  } catch (error: any) {
    // 記錄錯誤日誌並傳遞錯誤至下一個中間件
    logger.error(`取得歷史資料錯誤: ${error.message}`);
    next(error);
  }
}
