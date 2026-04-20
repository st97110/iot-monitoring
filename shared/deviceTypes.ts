// 前後端共用的設備型別 / 介面定義
// 這個檔案同時被 backend/src/config 和 frontend/src/config 引用
// 修改要同時考慮兩邊的消費者

export enum DEVICE_TYPES {
  ALL = '',
  TI = 'TI',         // 傾斜儀（Tiltmeter）
  WATER = 'WATER',   // 水位計
  RAIN = 'RAIN',     // 雨量筒
  GE = 'GE',         // 伸縮計
  TDR = 'TDR',       // TDR
  FLOW = 'FLOW',     // 流量計
  BATTERY = 'BATTERY', // 太陽能 + 電池站點
}

export interface Sensor {
  name: string;
  channels: string[];
  type: DEVICE_TYPES;
  /** 準星 ETI 專用：把前端用的 key (AI_0) 映射到 InfluxDB 的 channel tag (TI-1A軸角度) */
  sourceChannelMapping?: Record<string, string>;
  /** 初始值，計算 Delta 用 */
  initialValues?: Record<string, number>;
  /** 水位計：井深 (m) */
  wellDepth?: number;
  /** 傾斜儀：滿刻度 ±FS° (常見 10/15/30) */
  fsDeg?: number;
  /** 伸縮計：滿刻度 (cm) */
  geRange?: number;
  /** 流量計：滿刻度 (m³/h) */
  flowMax?: number;
  /** 電池類：4mA 對應工程值（例：電壓 0V、電流 -50A） */
  scaleMin?: number;
  /** 電池類：20mA 對應工程值（例：電壓 30V、電流 +50A） */
  scaleMax?: number;
  /** 顯示單位（'V', 'A', 'mm', …） */
  unit?: string;
}

export interface Device {
  id: string;
  name: string;
  area?: string;
  type?: DEVICE_TYPES;
  sensors?: Sensor[];

  // --- 前端地圖 / 顯示專用欄位 ---
  /** 地圖座標 */
  lat?: number;
  lng?: number;
  /** 資料來源類型；'geostar' 代表是準星 ETI 儀器（非 WISE） */
  sourceType?: 'geostar';
  /**
   * 虛擬裝置用：同一台實體 WISE 拆成多個邏輯站點時，指向真正的實體 ID。
   * 例：`WISE-4010LAN_74FE486B76AA_OW1` 的 originalDeviceId = `WISE-4010LAN_74FE486B76AA`。
   * backend 掃描資料時會用實體 ID，查 config 時會 fallback 到 originalDeviceId。
   */
  originalDeviceId?: string;
}

export interface AreaConfig {
  name: string;
  routeGroup: 't14' | 't8';
  devices: Device[];
  // --- 前端地圖專用 ---
  defaultCenter?: [number, number];
  defaultZoom?: number;
}

/** 回傳該裝置的實體 ID（用於檔案系統 / InfluxDB 的 tag）。沒 originalDeviceId 就是自己。 */
export function getPhysicalId(device: Device): string {
  return device.originalDeviceId ?? device.id;
}
