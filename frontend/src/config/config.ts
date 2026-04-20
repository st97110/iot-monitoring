// 前端 config：純粹 re-export shared 的 deviceMapping/型別，
// 外加前端專用的 API_BASE 和 UI 標籤

// Re-export 共用內容（單一資料來源）
export { DEVICE_TYPES, getPhysicalId } from '../../../shared/deviceTypes';
export type { Sensor, Device, AreaConfig } from '../../../shared/deviceTypes';
export { deviceMapping } from '../../../shared/deviceMapping';

import { DEVICE_TYPES } from '../../../shared/deviceTypes';

// API base URL (Vite 會在 build 時替換 import.meta.env)
export const API_BASE: string = import.meta.env.PROD
  ? 'https://api.lianyougeo.com'
  : 'http://localhost:3000';

// 類型對應顯示名稱（UI 用）
export const DEVICE_TYPE_NAMES: Record<string, string> = {
  [DEVICE_TYPES.ALL]: '全部',
  [DEVICE_TYPES.TI]: '傾斜儀',
  [DEVICE_TYPES.WATER]: '水位計',
  [DEVICE_TYPES.RAIN]: '雨量筒',
  [DEVICE_TYPES.GE]: '伸縮計',
  [DEVICE_TYPES.TDR]: 'TDR',
  [DEVICE_TYPES.FLOW]: '流量計',
  [DEVICE_TYPES.BATTERY]: '電池',
};

// 分區顯示順序（Home 頁分類按鈕可用）
export const DEVICE_TYPE_ORDER: DEVICE_TYPES[] = [
  DEVICE_TYPES.ALL,
  DEVICE_TYPES.TI,
  DEVICE_TYPES.WATER,
  DEVICE_TYPES.GE,
  DEVICE_TYPES.RAIN,
  DEVICE_TYPES.TDR,
];
