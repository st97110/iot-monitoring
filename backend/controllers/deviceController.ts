import { Request, Response, NextFunction } from 'express';
import { safeGetDevices } from '../services/safeGetDevices';
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

// 取得所有儀器列表，可選擇來源 wise / tdr / both
export async function getDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const source = parseSource(req.query.source as string | undefined);
    const devices = await safeGetDevices(source);
    res.json(devices);
  } catch (error: any) {
    logger.error(`取得設備列表錯誤: ${error.message}`);
    next(error);
  }
}