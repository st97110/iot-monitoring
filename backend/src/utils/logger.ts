// backend/utils/logger.ts

import fs from 'fs-extra';
import path from 'path';
import { createLogger, format, transports, Logger } from 'winston';

// 1. 確保日誌輸出目錄存在
const logDir = path.resolve(__dirname, '../../logs');
fs.ensureDirSync(logDir);

// 2. 定義日誌輸出格式
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// 3. 建立 Logger 實例
export const logger: Logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    // 輸出到控制台（帶顏色）
    new transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      )
    }),
    // 只記錄 error 等級到 error.log
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    // 記錄所有等級到 combined.log
    new transports.File({
      filename: path.join(logDir, 'combined.log')
    })
  ],
  exceptionHandlers: [
    // 未捕捉到的例外會寫到 exceptions.log
    new transports.File({
      filename: path.join(logDir, 'exceptions.log')
    })
  ],
  exitOnError: false, // 發生 exception 時不自動退出
});
