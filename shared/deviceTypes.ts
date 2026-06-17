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
  /**
   * 位移類（GE 伸縮計）每日累積變化量管理基準值 (mm)。
   * 對應地工管理參考基準：預警(黃)/警戒(橙)/行動(紅)。
   * 未設則套 DEFAULT_GE_DAILY_THRESHOLDS。
   * 之後 TI / 水位等要管理基準時，可比照新增對應欄位。
   */
  dailyThresholds?: AlertThresholds;
}

/** 三級管理基準值：預警(黃) / 警戒(橙) / 行動(紅) */
export interface AlertThresholds {
  warn: number;   // 預警 黃燈
  alert: number;  // 警戒 橙燈
  action: number; // 行動 紅燈
}

/**
 * 地中伸縮計 (GE) 每日累積變化量預設管理基準值 (mm)
 * 來源：地工「地中伸縮計管理參考基準值」表 3-7（每日累積變化量列）
 *   預警 10 / 警戒 50 / 行動 100
 */
export const DEFAULT_GE_DAILY_THRESHOLDS: AlertThresholds = {
  warn: 10,
  alert: 50,
  action: 100,
};

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
  /**
   * 是否為內部裝置：設為 true 時前端（Home/History/Trend/Map）不顯示，
   * 但 backend scanner 與專用 API endpoint 仍正常運作。
   * 用途：不想讓一般使用者看到的站點（例如家用的電池監測）。
   */
  internal?: boolean;
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
