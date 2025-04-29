import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { saveFile } from '../services/FileService';
import { logger } from '../utils/logger';
import { config } from '../config/config';

// WISE 模組上傳日誌，尚未儲存到 DB
export async function uploadWiseLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { macAddress, logType, date, filename } = req.params;

    // 確認 logType 合法
    if (logType !== 'signal_log' && logType !== 'system_log') {
      res.status(400).json({ error: '不支援的 logType，必須是 signal_log 或 system_log' });
      return;
    }

    // 解析 body (WISE 上傳的是 raw buffer)
    if (!req.body || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: '無效的請求內容，必須是 raw buffer' });
      return;
    }

     // 存檔路徑：baseDir/deviceFolder/logType/date/filename
     // 確保目錄存在並儲存檔案
     await saveFile(config.folder.wiseDataDir, macAddress, date, filename, req.body, logType);

    logger.info(`已儲存 WISE 日誌: ${config.folder.wiseDataDir}/${macAddress}/${logType}/${date}/${filename}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`儲存 WISE 日誌錯誤: ${error.message}`);
    next(error);
  }
}
