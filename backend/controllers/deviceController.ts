import { Request, Response, NextFunction } from 'express';
import { getAllDevices } from '../services/deviceService';
import { logger } from '../utils/logger';

// 取得所有儀器列表
export async function getDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devices = await getAllDevices();
    res.json(devices);
  } catch (error: any) {
    logger.error(`取得設備列表錯誤: ${error.message}`);
    next(error);
  }
}