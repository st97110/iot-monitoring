import { Request, Response, NextFunction } from 'express';
import { saveFile } from '../services/FileService';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export async function uploadTdrData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { device, timestamp, data } = req.body; // timestamp 可能是 "2025-05-13T16:30:07+08:00"
    if (!device || !timestamp || !Array.isArray(data)) {
      res.status(400).json({ error: '缺少必要欄位 (device, timestamp, data)' });
      return;
    }

    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) {
      res.status(400).json({ error: 'timestamp 格式錯誤' });
      return;
    }

    // 創建 dateFolder，使用解析後的 Date 對象轉為 UTC 日期，確保日期文件夾名不受原始時區偏移影響
    // 例如 "2025-05-13T16:30:07+08:00" 會得到 UTC 的 "2025-05-13"
    const dateFolder = ts.toISOString().slice(0, 10).replace(/-/g, ''); // 結果如 "20250513"

    // 生成文件名：
    // 1. 從原始 timestamp 字符串中提取日期時間部分 (去掉時區偏移)
    // 2. 移除特殊字符
    let dateTimePart = timestamp;
    const plusSignIndex = timestamp.indexOf('+');

    if (plusSignIndex > -1) {
      dateTimePart = timestamp.substring(0, plusSignIndex);
    } else if (timestamp.endsWith('Z')) {
      dateTimePart = timestamp.substring(0, timestamp.length -1);
    }
    // dateTimePart 現在是 "2025-05-13T16:30:07" (無時區)

    const filename = `${dateTimePart.replace(/[-:T]/g, '')}.json`; // 結果如 "20250513163007.json"

    // JSON 內容仍然使用原始的、帶有時區信息的 timestamp，這對於後續解析很重要
    const buffer = Buffer.from(JSON.stringify({ device, timestamp, data }, null, 2), 'utf8');

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