// backend/utils/areaHelper.ts
import { DEVICE_TYPES, deviceMapping, Device, Sensor, AreaConfig, getPhysicalId } from '../config/config';

/**
 * 統一查找邏輯：支援「實體 ID」與「虛擬 ID」雙向。
 *
 * - 前端會用虛擬 ID（例：`WISE-4010LAN_74FE486B76AA_OW1`），帶 originalDeviceId 指回實體
 * - 後端掃描 wise_data/ 時拿到的是實體 ID（資料夾名）
 *
 * 查詢時：先試 exact match（虛擬 ID），若無命中就用實體 ID 撈所有指回它的虛擬裝置。
 */

// 一個實體 ID 可能對應 1 到 N 個虛擬裝置
const byExactId: Map<string, Device> = new Map();
const byPhysicalId: Map<string, Device[]> = new Map();
let isCacheBuilt = false;

function buildDeviceConfigCache(): void {
    if (isCacheBuilt) return;
    for (const area of Object.values(deviceMapping as Record<string, AreaConfig>)) {
        for (const device of area.devices ?? []) {
            if (!device?.id) continue;
            byExactId.set(device.id, device);
            const phys = getPhysicalId(device);
            const list = byPhysicalId.get(phys) ?? [];
            list.push(device);
            byPhysicalId.set(phys, list);
        }
    }
    isCacheBuilt = true;
}

/** 找出對應此 ID 的所有 Device（實體 ID 可能對應多個虛擬裝置；虛擬 ID 就是自己一個） */
function findDevices(id: string): Device[] {
    if (!isCacheBuilt) buildDeviceConfigCache();
    const exact = byExactId.get(id);
    if (exact) return [exact];
    return byPhysicalId.get(id) ?? [];
}

/** 由 deviceId 反查區域名稱（找不到回傳 undefined） */
export function getAreaByDeviceId(deviceId: string): string | undefined {
  const devs = findDevices(deviceId);
  if (devs.length === 0) return undefined;
  return devs[0].area;
}

/**
 * 根據前端傳來的唯一邏輯 ID，從 deviceMapping 中查找對應的設備配置對象。
 * 使用緩存以提高性能。
 * @param logicalId - 前端使用的唯一邏輯設備 ID (例如 "WISE-..._SITE1", "SN_24782")
 * @returns 找到的設備配置對象 (Device) 或 undefined
 */
export function getDeviceConfigById(logicalId: string): Device | undefined {
    if (!isCacheBuilt) buildDeviceConfigCache();
    // 先找虛擬 ID 直接命中
    const exact = byExactId.get(logicalId);
    if (exact) return exact;
    // 若傳入實體 ID，回第一個指回它的虛擬裝置（多個時任選一個，多半是 type 相同）
    const phys = byPhysicalId.get(logicalId);
    return phys?.[0];
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

/** Helper：由 deviceId 判斷是否為雨量筒（支援實體 / 虛擬 ID） */
export function isDeviceRainGauge(deviceId: string): boolean {
  return findDevices(deviceId).some(d => d.type === DEVICE_TYPES.RAIN);
}

/**
 * Helper：由 deviceId 反查 sensors 設定
 * 若傳入實體 ID 且該實體被拆成多個虛擬裝置，會把所有虛擬裝置的 sensors 合起來回傳
 * （因為 scanner 拿到的是實體 MAC，需要一次處理所有 channel）
 */
export function getSensorsByDeviceId(id: string): Sensor[] | undefined {
  const devs = findDevices(id);
  if (devs.length === 0) return undefined;
  return devs.flatMap(d => d.sensors ?? []);
}

interface sensor {
  id: string;
  name: string;
  area: string;
  type: DEVICE_TYPES;
  sensors: any[] | undefined;
}

export interface SensorCtx {
  type       : DEVICE_TYPES;       // WATER | TI | GE | RAIN | BATTERY
  raw        : number;             // 4–20 mA 或 Cnt
  wellDepth ?: number;             // 水位計滿量程 (m)
  fsDeg     ?: number;             // 傾斜儀 ±FS°（15/30）
  geRange   ?: number;             // 伸縮計滿量程 (cm)
  scaleMin  ?: number;             // 電池類：4mA 對應工程值
  scaleMax  ?: number;             // 電池類：20mA 對應工程值
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
    case DEVICE_TYPES.BATTERY: {           // mA → 線性工程值（V / A / %）
      const lo = ctx.scaleMin ?? 0;
      const hi = ctx.scaleMax ?? 100;
      const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
      return lo + ratio * (hi - lo);
    }
    case DEVICE_TYPES.RAIN:                // 保留計數
    default:
      return raw;
  }
}

/**
 * 將 raw EgF / Cnt 轉成 PEgF 與 delta PEgF
 * @param deviceId  例如 'WISE-4010LAN_74FE489299CB'（可為實體或虛擬 ID）
 * @param raw       CSV 解析後的物件
 */
export function toPEgF(deviceId: string, raw: Record<string, any>) {
  // 使用共用的 sensor 查找（會把拆站虛擬裝置的 sensors 合起來）
  const sensors = getSensorsByDeviceId(deviceId);
  const deviceType = getDeviceConfigById(deviceId)?.type;

  if (!sensors || sensors.length === 0) return {};

  const device = { type: deviceType, sensors };
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
        scaleMin  : sensor.scaleMin,
        scaleMax  : sensor.scaleMax,
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