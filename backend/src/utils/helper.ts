// backend/utils/areaHelper.ts
import { DEVICE_TYPES, deviceMapping, Device } from '../config/config';

/** 由 deviceId 反查區域名稱（找不到回傳 undefined） */
export function getAreaByDeviceId(deviceId: string): string | undefined {
  for (const area of Object.values(deviceMapping)) {
    if (area.devices.some(d =>
      (d.id  && deviceId === d.id)
    )) return area.name;
  }
  return undefined;
}

export type SourceKey = 'wise' | 'tdr';

export function getSourceByDeviceId(id: string): SourceKey {
  const upper = id.toUpperCase();
  if (upper.startsWith('WISE-')) return 'wise';
  if (upper.startsWith('TDR_') || upper.startsWith('TDR-')) return 'tdr';
  throw new Error(`[getSourceByDeviceId] 無法判斷 deviceId=${id} 來源（請補規則）`);
}

/**
 * Helper：由 deviceId 反查裝置類型（找不到回傳 undefined）
 */
export function getTypeByDeviceId(id: string) {
  for (const area of Object.values(deviceMapping)) {
    const cfg = area.devices.find(d => d.id === id);
    if (cfg) return cfg;
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
      return ratio * (ctx.wellDepth ?? 50);
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
 * 將 raw EgF / Cnt 轉成 PEgF 與 display
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
        type      : device.type,
        raw       : val,
        wellDepth : sensor.wellDepth,
        fsDeg     : sensor.fsDeg,
        geRange   : sensor.geRange,
      });

      // ① 工程值欄位：AI_0 PEgF
      const peField = `${ch} PEgF`;
      result[peField] = pe;

      // ② display（工程值‑初始值）──僅 TI / GE 有意義
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
        result[`${ch} display`] = pe - initPE;               // 例：AI_0 display
      }
    }
  }

  return result;   // 只回傳要寫進 Influx 的欄位
}