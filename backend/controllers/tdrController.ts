import { Request, Response, NextFunction } from 'express';
import { writeTdrDataToInflux } from '../services/influxDataService';
import { logger } from '../utils/logger';

export async function uploadTdrData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { device, timestamp, data } = req.body;
    await writeTdrDataToInflux(device, timestamp, data);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`上傳TDR數據錯誤: ${error.message}`);
    next(error);
  }
}
