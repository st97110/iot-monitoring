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

export interface Sensor {
  name          : string;
  channels      : string[];
  type          : DEVICE_TYPES;
  initialValues?: Record<string, number>;
  wellDepth?    : number; // For WATER
  fsDeg?        : number; // For TI
  geRange?      : number; // For GE
  flowRateFactor?: number; // For FLOW
}

export interface Device {
  id     : string;
  name   : string;
  area?  : string;
  type?   : DEVICE_TYPES;
  sensors?: Sensor[];
}


// 裝置類型代碼（type）
export enum DEVICE_TYPES {
  ALL = '',
  TI = 'TI',         // 傾斜儀（TIltmeter）
  WATER = 'WATER',   // 水位計
  RAIN = 'RAIN',     // 雨量筒
  GE = 'GE',         // 伸縮計
  TDR = 'TDR',       // TDR
  FLOW = 'FLOW',     // FLOW
}

export interface AreaConfig { // 可以為 Area 創建一個 interface
  name: string;
  routeGroup: 't14' | 't8'; // ✨ 新增：標識區域屬於哪個路線群組
  devices: Device[];
}

export const deviceMapping: Record<
  string,
  AreaConfig
> = {
  '80K區': {
    name: '80K區',
    routeGroup: 't14',
    devices: [
      { id: 'TDR_T14_T1', name: 'T1 TDR', area: '80K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T2', name: 'T2 TDR', area: '80K區', type: DEVICE_TYPES.TDR }
    ],
  },
  '春陽區': {
    name: '春陽區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_74FE48941ABE',
        name: '84.6K, 84.65K',
        area: '春陽區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 12.259 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 12.865 } },
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, initialValues: { AI_2: 11.388 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, initialValues: { AI_3: 10.317 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2E3',
        name: '84.7K',
        area: '春陽區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, initialValues: { AI_2: 11.56 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, initialValues: { AI_3: 10.911 } },
        ]
      },
      { id: 'TDR_T14_AH3', name: 'AH3 TDR', type: DEVICE_TYPES.TDR }
    ]
  },
  '90K區': {
    name: '90K區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_74FE489299CB',
        name: '90K 地下水位計W2',
        area: '90K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: '地下水位計W2', channels: ['AI_0'], type: DEVICE_TYPES.WATER, wellDepth: -50 },
        ]
      },
      {
        id: 'WISE-4060LAN_00D0C9FD4D44',
        name: '91.5K雨量筒',
        area: '90K區',
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '91.5K雨量筒', channels: ['DI_0'], type: DEVICE_TYPES.RAIN,  },
        ]
      },
      { id: 'TDR_T14_T3', name: 'T3 TDR', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T4', name: 'T4 TDR', type: DEVICE_TYPES.TDR }
    ]
  },    
  '梅峰區': {
    name: '梅峰區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_00D0C9FAD2C9',
        name: '14.25K',
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 12.052 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 11.798 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2C9',
        name: '14.27K',
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, initialValues: { AI_2: 12.294 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, initialValues: { AI_3: 12.463 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAC4F8',
        name: '14甲CH1傾斜儀',
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, initialValues: { AI_0: 5.684 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, initialValues: { AI_1: 12.974 } },
        ]
      },
      { id: 'WISE-4010LAN_74FE489299F4', name: 'GE1', area: '梅峰區', type: DEVICE_TYPES.GE, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 9.97 }, geRange: 500 }] },
      { id: 'WISE-4010LAN_74FE4890BAFC', name: 'GE2', area: '梅峰區', type: DEVICE_TYPES.GE, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 18.155 }, geRange: 500 }] },
      { id: 'WISE-4010LAN_74FE48941AD9', name: 'GE3', area: '梅峰區', type: DEVICE_TYPES.GE, sensors: [{ name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 4.82 }, geRange: 500 }] },
      { id: 'TDR_T14A_CH1', name: 'CH1 TDR', area: '梅峰區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH2', name: 'CH2 TDR', area: '梅峰區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH4', name: 'CH4 TDR', area: '梅峰區', type: DEVICE_TYPES.TDR }
    ]
  },
  '台8線107K區': {
    name: '台8線107K區',
    routeGroup: 't8',
    devices: [
      { id: 'TDR_T8_T1', name: 'TDR T1 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T2', name: 'TDR T2 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T4', name: 'TDR T4 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T7', name: 'TDR T7 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T8', name: 'TDR T8 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T9', name: 'TDR T9 (台8)', area: '台8線107K區', type: DEVICE_TYPES.TDR },
      {
        id: 'WISE-4010LAN_74FE4860F492',
        name: 'OW10 水位計',
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW10 (AI0)', channels: ['AI_3'], type: DEVICE_TYPES.WATER, wellDepth: -40 }
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2C2',
        name: 'GE3 (20m, 80m) 伸縮計',
        area: '台8線107K區',
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: 'GE3 20m (AI0)', channels: ['AI_0'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_0: 4.984 } },
          { name: 'GE3 80m (AI1)', channels: ['AI_1'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_1: 5.457 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE48595E19',
        name: 'BT1 & BT3 傾斜儀',
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'BT1 A軸 (AI0)', channels: ['AI_0'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_0: 12.073 } },
          { name: 'BT1 B軸 (AI1)', channels: ['AI_1'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_1: 12.063 } },
          { name: 'BT3 A軸 (AI2)', channels: ['AI_2'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_2: 10.794 } },
          { name: 'BT3 B軸 (AI3)', channels: ['AI_3'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_3: 12.283 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486CEDFB',
        name: 'OW6 水位計',
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW6', channels: ['AI_0'], type: DEVICE_TYPES.WATER, wellDepth: -40 }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486B76BB',
        name: 'BT2 傾斜儀',
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'BT2 A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_2: 11.189 } },
          { name: 'BT2 B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_3: 11.896 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE488F3BA0',
        name: 'OW5 水位計',
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW5', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -40 }
        ]
      },
      {
        id: 'WISE-4060LAN_00D0C9E332E8',
        name: '107K+600 雨量筒',
        area: '台8線107K區',
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '10分鐘雨量', channels: ['DI_0'], type: DEVICE_TYPES.RAIN } // 雨量筒通常用 DI_0 Cnt
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486B76AA',
        name: 'OW1 水位計 & GE1 伸縮計',
        area: '台8線107K區',
        sensors: [
          { name: 'OW1', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -80 },
          { name: 'GE1 (20m)', channels: ['AI_2'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_2: 4.175 } },
          { name: 'GE1 (80m)', channels: ['AI_3'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_3: 4.781 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE487F4FE3',
        name: 'FL1~4 流量計',
        area: '台8線107K區',
        type: DEVICE_TYPES.FLOW, // ✨ 使用新的 FLOW 類型
        sensors: [
          { name: 'FL1', channels: ['AI_0'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL2', channels: ['AI_1'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL3', channels: ['AI_2'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL4', channels: ['AI_3'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ }
        ]
      }
    ]
  },
};