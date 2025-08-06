// backend/utils/areaHelper.ts
import { DEVICE_TYPES, deviceMapping, Device, Sensor, AreaConfig } from '../config/config';

// ✨ 緩存 deviceId -> deviceConfig 的查找結果，避免重複遍歷
const deviceConfigCache: Map<string, Device | undefined> = new Map();
let isCacheBuilt = false;

// 輔助函數：建立緩存
function buildDeviceConfigCache(): void {
    if (isCacheBuilt) return;
    for (const area of Object.values(deviceMapping as Record<string, AreaConfig>)) {
        if (area && Array.isArray(area.devices)) {
            for (const device of area.devices) {
                if (device && device.id) {
                    deviceConfigCache.set(device.id, device);
                }
            }
        }
    }
    isCacheBuilt = true;
}

/** 由 deviceId 反查區域名稱（找不到回傳 undefined） */
export function getAreaByDeviceId(deviceId: string): string | undefined {
  for (const area of Object.values(deviceMapping)) {
    if (area.devices.some(d =>
      (d.id  && deviceId === d.id)
    )) return area.name;
  }
  return undefined;
}

/**
 * 根據前端傳來的唯一邏輯 ID，從 deviceMapping 中查找對應的設備配置對象。
 * 使用緩存以提高性能。
 * @param logicalId - 前端使用的唯一邏輯設備 ID (例如 "WISE-..._SITE1", "SN_24782")
 * @returns 找到的設備配置對象 (Device) 或 undefined
 */
export function getDeviceConfigById(logicalId: string): Device | undefined {
    // 確保緩存已建立
    if (!isCacheBuilt) {
        buildDeviceConfigCache();
    }
    
    // 從緩存中查找
    if (deviceConfigCache.has(logicalId)) {
        return deviceConfigCache.get(logicalId);
    }
    
    // 如果緩存中沒有（理論上不應該，除非動態修改配置），可以選擇重新掃描一次或直接返回 undefined
    return undefined;
}

export type SourceKey = 'wise' | 'tdr' | 'geostar' | 'unknown';

/**
 * 根據前端傳來的唯一邏輯 ID，快速判斷其數據來源類型。
 * 主要用於需要快速分類的場景。
 * @param id 前端使用的唯一邏輯設備 ID
 * @returns 'wise', 'tdr', 'geostar', 或 'unknown'
 */
export function getSourceByDeviceId(id: string): SourceKey {
  if (!id || typeof id !== 'string') {
      return 'unknown';
  }
  const upper = id.toUpperCase();
  if (upper.startsWith('WISE-')) return 'wise';
  if (upper.startsWith('TDR_') || upper.startsWith('TDR-')) return 'tdr';
  if (upper.startsWith('SN_')) return 'geostar';
  throw new Error(`[getSourceByDeviceId] 無法判斷 deviceId=${id} 來源（請補規則）`);
}

/*
 * Helper：由 deviceId 判斷是否為雨量筒
 */
export function isDeviceRainGauge(deviceId: string): boolean {
  let isCurrentDeviceRainGauge = false;
  for (const area of Object.values(deviceMapping)) {
    const devCfg = area.devices.find(d => d.id === deviceId);
    if (devCfg && devCfg.type === DEVICE_TYPES.RAIN) {
        isCurrentDeviceRainGauge = true;
        break;
    }
  }
  return isCurrentDeviceRainGauge;
}

/**
 * Helper：由 deviceId 反查 channel 設定
 */
export function getSensorsByDeviceId(id: string): Sensor[] | undefined {
  for (const area of Object.values(deviceMapping)) {
    for (const device of area.devices) {
      if (device.id === id) return device.sensors;
    }
  }
  return undefined;
}

interface sensor {
  id: string;
  name: string;
  area: string;
  type: DEVICE_TYPES;
  sensors: any[] | undefined;
}

export interface SensorCtx {
  type       : DEVICE_TYPES;       // WATER | TI | GE | RAIN
  raw        : number;             // 4–20 mA 或 Cnt
  wellDepth ?: number;             // 水位計滿量程 (m)
  fsDeg     ?: number;             // 傾斜儀 ±FS°（15/30）
  geRange   ?: number;             // 伸縮計滿量程 (cm)
}

/** raw EgF/Cnt → 工程值 PEgF */
function rawToPEgF(ctx: SensorCtx): number {
  const { type, raw } = ctx;

  switch (type) {
    case DEVICE_TYPES.WATER: {             // mA → m
      const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
      return ratio * (ctx.wellDepth ?? -50);
    }
    case DEVICE_TYPES.TI: {                // mA → arc‑sec
      const fs  = ctx.fsDeg ?? 15;                      // ±FS°
      const deg = ((raw - 12) / 16) * (2 * fs);         // 4→‑fs, 12→0, 20→+fs
      return deg * 3600;                                // 度 → 秒
    }
    case DEVICE_TYPES.GE: {                // mA → cm
      const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
      return ratio * (ctx.geRange ?? 50);
    }
    case DEVICE_TYPES.RAIN:                // 保留計數
    default:
      return raw;
  }
}

/**
 * 將 raw EgF / Cnt 轉成 PEgF 與 delta PEgF
 * @param deviceId  例如 'WISE-4010LAN_74FE489299CB'
 * @param raw       CSV 解析後的物件
 */
export function toPEgF(deviceId: string, raw: Record<string, any>) {
  const devices: Device[] = Object.values(deviceMapping).flatMap(a => a.devices);
  const device = devices.find(d => d.id === deviceId /* … */);

  if (!device) return {};            // 找不到對應設定

  const result: Record<string, number> = {};

  for (const sensor of device.sensors ?? []) {
    for (const ch of sensor.channels) {
      // CSV 欄名：AI_0 EgF / DI_0 Cnt ...
      const egfField = `${ch} ${device.type === DEVICE_TYPES.RAIN ? 'Cnt' : 'EgF'}`;
      const val = parseFloat(raw[egfField]);
      if (Number.isNaN(val)) continue;

      // ➜ 真實值
      const pe = rawToPEgF({
        type      : sensor.type,
        raw       : val,
        wellDepth : sensor.wellDepth,
        fsDeg     : sensor.fsDeg,
        geRange   : sensor.geRange,
      });

      // ① 真實值欄位：AI_0 PEgF
      const peField = `${ch} PEgF`;                      // 例：AI_0 PEgF
      result[peField] = pe;
      // ② 展示值欄位：Delta（真實值‑初始值）──僅 TI / GE 有意義
      if (
        (device.type === DEVICE_TYPES.TI || device.type === DEVICE_TYPES.GE) &&
        sensor.initialValues?.[ch] != null
      ) {
        const initRaw  = sensor.initialValues[ch];           // mA
        const initPE   = rawToPEgF({
          type : device.type as DEVICE_TYPES,
          raw  : initRaw,
          wellDepth: sensor.wellDepth,
          fsDeg   : sensor.fsDeg,
          geRange : sensor.geRange,
        });
        result[`${ch} Delta`] = pe - initPE;               // 例：AI_0 Delta
      }
    }
  }
  return result;   // 只回傳要寫進 Influx 的欄位
}