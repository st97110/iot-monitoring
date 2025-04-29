import { Request, Response, NextFunction } from 'express';
import { saveFile } from '../services/FileService';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export async function uploadTdrData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { device, timestamp, data } = req.body;
    if (!device || !timestamp || !Array.isArray(data)) {
      res.status(400).json({ error: '缺少必要欄位 (device, timestamp, data)' });
      return;
    }

    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) {
      res.status(400).json({ error: 'timestamp 格式錯誤' });
      return;
    }

    const dateFolder = ts.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${timestamp.replace(/[-:T.Z]/g, '')}.json`; // 建議存成 .json（比較安全），掃描器讀 .json 寫入 InfluxDB。

    const buffer = Buffer.from(JSON.stringify({ timestamp, data }, null, 2), 'utf8');

    await saveFile(
      config.folder.tdrDataDir,
      device,
      dateFolder,
      filename,
      buffer
    );

    logger.info(`已儲存 TDR 資料: ${config.folder.tdrDataDir}/${device}/${dateFolder}/${filename}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`儲存 TDR 資料錯誤: ${error.message}`);
    next(error);
  }
}