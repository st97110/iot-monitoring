// 後端 API 回應的型別定義（對應 backend/src/controllers/* 的回傳結構）
// 放在這裡讓前端所有 axios 呼叫可以有型別

export type SourceKey = 'wise' | 'tdr' | 'both' | 'geostar';

/**
 * GET /api/latest?deviceId=...&source=wise
 * 回傳 { [deviceId]: LatestRecord }
 */
export interface WiseLatestRecord {
  deviceId?: string;
  timestamp?: string;
  source?: string;
  channels?: Record<string, Record<string, number>>;  // { AI_0: { EgF: 12.3, PEgF: 25.1 } }
  raw?: Record<string, number | string>;               // { 'AI_0 EgF': 12.3, ... }
  /** GE 告警基準：昨日 (Asia/Taipei) 各 channel 的 ±1σ 穩健均值 EgF (mA)，後端附上、給前端算變化量 */
  geBaseline?: Record<string, number>;                 // { AI_0: 4.98, AI_1: 5.46 }
  rainfall_10m?: number | null;
  rainfall_1h?: number | null;
  rainfall_3h?: number | null;
  rainfall_24h?: number | null;
  [key: string]: any;  // 其他動態欄位（雨量 enrichRainfall 等）
}

export type LatestResponse = Record<string, WiseLatestRecord>;

/**
 * GET /api/history?deviceId=...&startDate=...&endDate=...
 * 回傳 WiseLatestRecord[]
 */
export type HistoryResponse = WiseLatestRecord[];

/**
 * GET /api/devices?source=wise
 */
export interface DeviceInfo {
  id: string;
  name: string;
  model?: string;
  area?: string;
  lastUpdated?: string | null;
  totalRecords?: number;
  hasData?: boolean;
  error?: string;
}
export type DevicesResponse = DeviceInfo[];

/**
 * TDR /api/latest?source=tdr
 */
export interface TdrDataPoint {
  distance_m: number;
  rho: number;
}
export interface TdrRecord {
  deviceId: string;
  timestamp: string | null;
  source: 'tdr';
  data: TdrDataPoint[];
}

/**
 * 電池專用 endpoint 的 response
 * GET /view/80k-battery-XXX/latest
 */
export interface BatterySensor {
  name: string;
  channel: string;
  unit: string;
  value: number | null;
  rawUnit: string;
  rawValue: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
}

export interface BatteryLatestResponse {
  deviceId: string;
  deviceName: string;
  timestamp: string | null;
  sensors: BatterySensor[];
}
