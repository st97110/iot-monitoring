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

// 裝置類型代碼（type）
export const DEVICE_TYPES = {
  ALL: '',
  TI: 'TI',         // 傾斜儀（TIltmeter）
  WATER: 'WATER',   // 水位計
  RAIN: 'RAIN',     // 雨量筒
  GE: 'GE',         // 伸縮計
  TDR: 'TDR',       // TDR
};

export const deviceMapping = {
  '80k區': {
    name: '80k區',
    devices: [
      { id: 'T1', name: 'T1 TDR', lat: 24.0175, lng: 121.128056, type: DEVICE_TYPES.TDR },
      { id: 'T2', name: 'T2 TDR', lat: 24.018056, lng: 121.129444, type: DEVICE_TYPES.TDR }
    ],
  },
  '春陽區': {
    name: '春陽區',
    devices: [
      {
        mac: '74FE48941ABE',
        name: '84.6k',
        lat: 24.0301,
        lng: 121.16,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 12.259 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 12.865 } },
        ]
      },
      {
        mac: '00D0C9FAD2E3',
        name: '84.65k',
        lat: 24.0302,
        lng: 121.16,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 11.388 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 10.317 } },
        ]
      },{
        mac: '00D0C9FAD2E3',
        name: '84.7k',
        lat: 24.0302,
        lng: 121.16,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, initialValues: { AI_2: 11.56 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, initialValues: { AI_3: 10.911 } },
        ]
      },
      { id: 'AH3', name: 'AH3 TDR', lat: 24.029722, lng: 121.161389, type: DEVICE_TYPES.TDR }
    ]
  },
  '90k區': {
    name: '90k區',
    devices: [
      {
        mac: '74FE489299CB',
        name: '90k 地下水位計W2',
        lat: 24.025278,
        lng: 121.18385,
        sensors: [
          { name: '地下水位計W2', channels: ['AI_0'], type: DEVICE_TYPES.WATER },
        ]
      },
      {
        mac: '00D0C9FD4D44',
        name: '91.5k雨量筒',
        lat: 24.0267,
        lng: 121.184,
        sensors: [
          { name: '91.5k雨量筒', channels: ['AI_0'], type: DEVICE_TYPES.RAIN },
        ]
      },
      { id: 'T3', name: 'T3 TDR', lat: 24.0252, lng: 121.183611, type: DEVICE_TYPES.TDR },
      { id: 'T4', name: 'T4 TDR', lat: 24.0267, lng: 121.1838, type: DEVICE_TYPES.TDR }
    ]
  },
  '梅峰區': {
    name: '梅峰區',
    devices: [
      {
        mac: '00D0C9FAD2C9',
        name: '14.25k',
        lat: 24.08995,
        lng: 121.17361,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 12.052 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 11.798 } },
        ]
      },
      {
        mac: '00D0C9FAD2C9',
        name: '14.27k',
        lat: 24.08995,
        lng: 121.17361,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, initialValues: { AI_2: 12.294 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, initialValues: { AI_3: 12.463 } },
        ]
      },
      {
        mac: '00D0C9FAC4F8',
        name: '14甲CH1傾斜儀',
        lat: 24.0898,
        lng: 121.17389,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 5.684 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 12.974 } },
        ]
      },
      { mac: '74FE489299F4', name: 'GE1', lat: 24.08945, lng: 121.173611, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 9.97 } }] },
      { mac: '74FE4890BAFC', name: 'GE2', lat: 24.0896, lng: 121.17395, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 18.155 } }] },
      { mac: '74FE48941AD9', name: 'GE3', lat: 24.089, lng: 121.17405, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 4.82 } }] },
      { id: 'CH1', name: 'CH1 TDR', lat: 24.0898, lng: 121.1738, type: DEVICE_TYPES.TDR },
      { id: 'CH2', name: 'CH2 TDR', lat: 24.0896, lng: 121.1741, type: DEVICE_TYPES.TDR },
      { id: 'CH3', name: 'CH3 TDR', lat: 24.089, lng: 121.1739, type: DEVICE_TYPES.TDR }
    ]
  }
};