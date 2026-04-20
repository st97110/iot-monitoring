// backend/config/config.ts
// 環境變數 / 伺服器設定在這裡；設備型別與 deviceMapping 已抽到 shared/，由此處 re-export
import path from 'path';
import { logger } from '../utils/logger';
import 'dotenv/config';

// Re-export 共用型別與 mapping，讓既有 import 路徑 (../config/config) 不用改
export {
  DEVICE_TYPES,
  getPhysicalId,
  type Sensor,
  type Device,
  type AreaConfig,
} from '../../../shared/deviceTypes';
export { deviceMapping } from '../../../shared/deviceMapping';

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
  wiseDataDir: string;
  tdrDataDir: string;
  wiseBackupDir: string;
  tdrBackupDir: string;
}

export interface Config {
  port: number;
  folder: FolderPaths;
  scanInterval: number;
  nodeEnv: string;
  influx: InfluxConfig;
}

/** 取環境變數，若不存在且沒有預設值就 throw */
function getEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) {
    logger.warn(`[Config] 環境變數 ${name} 未設定，使用預設值: ${fallback}`);
    return fallback;
  }
  throw new Error(`[Config] 缺少必要的環境變數：${name}`);
}

/** 取環境變數並轉成數字 */
function getEnvInt(name: string, fallback?: number): number {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) throw new Error(`[Config] 環境變數 ${name} 必須是數字，但得到: ${value}`);
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
    wiseDataDir: getEnv('WISE_DATA_DIR', path.resolve(__dirname, '../wise_data')),
    tdrDataDir: getEnv('TDR_DATA_DIR', path.resolve(__dirname, '../tdr_data')),
    wiseBackupDir: getEnv('WISE_BACKUP_DIR', path.resolve(__dirname, '../backup/wise_backup')),
    tdrBackupDir: getEnv('TDR_BACKUP_DIR', path.resolve(__dirname, '../backup/tdr_backup')),
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
    },
  },
};

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
