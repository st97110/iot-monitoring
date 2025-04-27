// config/config.ts
import path from 'path';

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

export interface Config {
  port: number;
  dataDir: string;
  scanInterval: number;
  influx: InfluxConfig;
}

export const config: Config = {
  // 伺服器啟動監聽的 Port
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,

  // 原本 DATA_DIR
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../wise_data'),

  // 原本 SCAN_INTERVAL
  scanInterval: process.env.SCAN_INTERVAL ? parseInt(process.env.SCAN_INTERVAL, 10) : 600,

  // InfluxDB v2 設定
  influx: {
    url: process.env.INFLUX_URL || 'http://localhost:8086',
    org: process.env.INFLUX_ORG || 'my-org',
    tokens: {
      tdr: process.env.INFLUX_TOKEN_TDR || '',
      wise: process.env.INFLUX_TOKEN_WISE || '',
    },
    buckets: {
      tdr: process.env.INFLUX_BUCKET_TDR || '',
      wise: process.env.INFLUX_BUCKET_WISE || '',
    }
  }
};
