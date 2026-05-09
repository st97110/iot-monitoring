// 前端 config：re-export shared 的 deviceMapping/型別，外加前端專用的 API_BASE 和 UI 標籤
// 注意：前端看到的 deviceMapping 會濾掉 `internal: true` 的裝置，
// 讓一般使用者看不到內部站點（例如 T2 電池），但 backend 和 /view/... 仍正常運作。

// Re-export 共用型別
export { DEVICE_TYPES, getPhysicalId } from '../../../shared/deviceTypes';
export type { Sensor, Device, AreaConfig } from '../../../shared/deviceTypes';

import { DEVICE_TYPES, AreaConfig } from '../../../shared/deviceTypes';
import { deviceMapping as rawDeviceMapping } from '../../../shared/deviceMapping';

// 過濾條件：
//   1. 只保留 routeGroup === 't14' 的區域（T8 由其他系統管理，不在這個前端顯示）
//   2. 過濾掉 internal: true 的裝置（例如 T2 電池由 /view/... 私人頁面看，主站不顯示）
// backend 不過濾這些，scanner 跟 /api/* 仍能處理 T8 與 internal 裝置
export const deviceMapping: Record<string, AreaConfig> = Object.fromEntries(
  Object.entries(rawDeviceMapping)
    .filter(([, area]) => area.routeGroup === 't14')
    .map(([key, area]) => [
      key,
      { ...area, devices: area.devices.filter(d => !d.internal) },
    ]),
);

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
