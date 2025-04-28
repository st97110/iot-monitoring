// backend/config/config.ts
import path from 'path';
import { logger } from '../utils/logger'; // ⚡️記得要有 logger
import 'dotenv/config';

export interface InfluxTokens {
  tdr: string;
  wise: string;
}

export interface InfluxBuckets {
  tdr: string;
  wise: string;
}

export interface InfluxConfig {
  url: string;
  org: string;
  tokens: InfluxTokens;
  buckets: InfluxBuckets;
}

export interface FolderPaths {
  wiseDataDir: string;      // WISE原始資料夾
  tdrDataDir: string;       // TDR原始資料夾
  wiseBackupDir: string;    // WISE已寫入DB的備份資料夾
  tdrBackupDir: string;     // TDR已寫入DB的備份資料夾
}

export interface Config {
  port: number;
  folder: FolderPaths;
  scanInterval: number;
  nodeEnv: string;
  influx: InfluxConfig;
}


/**
 * 取環境變數，若不存在且沒有預設值，就直接 throw
 */
function getEnv(name: string, fallback?: string): string {
  const value = process.env[name];

  if (value !== undefined && value !== '') {
    return value;
  }

  if (fallback !== undefined) {
    logger.warn(`[Config] 環境變數 ${name} 未設定，使用預設值: ${fallback}`);
    return fallback;
  }

  throw new Error(`[Config] 缺少必要的環境變數：${name}`);
}

/**
 * 取環境變數並轉成數字
 */
function getEnvInt(name: string, fallback?: number): number {
  const value = process.env[name];

  if (value !== undefined && value !== '') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`[Config] 環境變數 ${name} 必須是數字，但得到: ${value}`);
    }
    return parsed;
  }

  if (fallback !== undefined) {
    logger.warn(`[Config] 環境變數 ${name} 未設定，使用預設值: ${fallback}`);
    return fallback;
  }

  throw new Error(`[Config] 缺少必要的環境變數：${name}`);
}

export const config: Config = {
  port: getEnvInt('PORT', 3000),
  folder: {
    wiseDataDir: getEnv('WISE_DATA_DIR', path.resolve(__dirname, '../wise_data')),         // 例如：原始 wise_data/
    tdrDataDir: getEnv('TDR_DATA_DIR', path.resolve(__dirname, '../tdr_data')),             // 例如：原始 tdr_data/
    wiseBackupDir: getEnv('WISE_BACKUP_DIR', path.resolve(__dirname, '../backup/wise_backup')),    // DB寫入後的 wise備份
    tdrBackupDir: getEnv('TDR_BACKUP_DIR', path.resolve(__dirname, '../backup/tdr_backup')),        // DB寫入後的 tdr備份
  },
  scanInterval: getEnvInt('SCAN_INTERVAL', 600),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  influx: {
    url: getEnv('INFLUX_URL'),
    org: getEnv('INFLUX_ORG'),
    tokens: {
      tdr: getEnv('INFLUX_TOKEN_TDR'),
      wise: getEnv('INFLUX_TOKEN_WISE'),
    },
    buckets: {
      tdr: getEnv('INFLUX_BUCKET_TDR'),
      wise: getEnv('INFLUX_BUCKET_WISE'),
    }
  }
};

// 啟動時 Log 設定資訊（只在非 production 顯示）
if (config.nodeEnv !== 'production') {
  logger.info(`[Config] 使用環境: ${config.nodeEnv}`);
  logger.info(`[Config] 伺服器 Port: ${config.port}`);
  for (const key in config.folder) {
    logger.info(`[Config] 資料夾位置: ${key}: ${config.folder[key as keyof FolderPaths]}`);
  }
  logger.info(`[Config] 掃描間隔: ${config.scanInterval} 秒`);
  logger.info(`[Config] Influx URL: ${config.influx.url}`);
  logger.info(`[Config] Influx Org: ${config.influx.org}`);
}