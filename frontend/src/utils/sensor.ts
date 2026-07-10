import { DEVICE_TYPES, Device, Sensor, DEFAULT_GE_DAILY_THRESHOLDS } from '../config/config';

// ======== 設備類型對應顏色漸層 ========
const typeColors: Record<string, string> = {
  [DEVICE_TYPES.TI]: 'from-blue-500 to-blue-600',
  [DEVICE_TYPES.WATER]: 'from-cyan-500 to-cyan-600',
  [DEVICE_TYPES.RAIN]: 'from-indigo-500 to-indigo-600',
  [DEVICE_TYPES.GE]: 'from-green-500 to-green-600',
  [DEVICE_TYPES.TDR]: 'from-purple-500 to-purple-600',
  [DEVICE_TYPES.FLOW]: 'from-pink-500 to-pink-600',
  [DEVICE_TYPES.BATTERY]: 'from-amber-500 to-amber-600',
};

// ======== 設備類型對應邊框顏色 ========
const typeBorderColors: Record<string, string> = {
  [DEVICE_TYPES.TI]: 'border-blue-500',
  [DEVICE_TYPES.WATER]: 'border-cyan-500',
  [DEVICE_TYPES.RAIN]: 'border-indigo-500',
  [DEVICE_TYPES.GE]: 'border-green-500',
  [DEVICE_TYPES.TDR]: 'border-purple-500',
  [DEVICE_TYPES.FLOW]: 'border-pink-500',
  [DEVICE_TYPES.BATTERY]: 'border-amber-500',
};

export function getDeviceTypeColor(device: { type?: DEVICE_TYPES }): string {
  const type = device.type;
  return (type && typeColors[type]) || 'from-gray-500 to-gray-600';
}

export function getDeviceTypeBorderColor(device: { type?: DEVICE_TYPES }): string {
  const type = device.type;
  return (type && typeBorderColors[type]) || 'border-gray-500';
}

/** 單一 channel 的數據（如 entry.channels.AI_0） */
export interface ChannelData {
  EgF?: number;
  PEgF?: number;
  Cnt?: number;
  [key: string]: number | undefined;
}

/** 該時間點的完整 entry（含 raw / channels / rainfall_XX） */
export interface EntryData {
  timestamp?: string;
  raw?: Record<string, any>;
  channels?: Record<string, ChannelData>;
  rainfall_10m?: number | null;
  rainfall_1h?: number | null;
  rainfall_3h?: number | null;
  rainfall_24h?: number | null;
  [key: string]: any;
}

/** 警示等級：正常 / 預警(黃) / 警戒(橙) / 行動(紅) */
export type AlertLevel = 'normal' | 'warn' | 'alert' | 'action';

const ALERT_SEVERITY: Record<AlertLevel, number> = { normal: 0, warn: 1, alert: 2, action: 3 };

/** 取兩個等級中較嚴重者（給整張卡片彙總多個 channel 用） */
export function worseLevel(a: AlertLevel, b: AlertLevel): AlertLevel {
  return ALERT_SEVERITY[a] >= ALERT_SEVERITY[b] ? a : b;
}

export interface AlertOpts {
  /** RAIN 用：目前比對的雨量區間 key（rainfall_1h 等） */
  rainfallIntervalKey?: string;
  /** GE 每日累積用：今日 00:00 的 EgF (mA)，由後端 dayStart 提供；無則 fallback 安裝初始值 */
  dayStartEgF?: number;
}

/**
 * 取得單一 channel 的警示等級。
 * - GE（地中伸縮計）：四級，依「每日累積變化量 = 目前值 − 今日00:00值」的絕對值比對管理基準
 * - 其他儀器：維持二級（normal / action），語意同舊版 isNormalData
 */
export function getAlertLevel(
  deviceConfig: Device | undefined,
  sensor: Sensor | undefined,
  chData: ChannelData | number | null | undefined,
  opts: AlertOpts = {},
): AlertLevel {
  if (!deviceConfig || chData == null) return 'normal';

  const isGeoStarSource = deviceConfig.sourceType === 'geostar';
  const typeToUse = deviceConfig.type;
  const bool = (normal: boolean): AlertLevel => (normal ? 'normal' : 'action');

  if (typeToUse === DEVICE_TYPES.RAIN) {
    const rainValue = typeof chData === 'number' ? chData : undefined;
    if (rainValue == null) return 'normal';
    const key = opts.rainfallIntervalKey;
    if (deviceConfig.area === '台8線107K區') {
      const t: Record<string, number> = { rainfall_1h: 25, rainfall_3h: 45, rainfall_24h: 145 };
      return bool(rainValue < ((key && t[key]) || Infinity));
    }
    if (deviceConfig.area === '90K區') {
      const t: Record<string, number> = { rainfall_10m: 15, rainfall_1h: 40, rainfall_3h: 110, rainfall_24h: 200 };
      return bool(rainValue < ((key && t[key]) || Infinity));
    }
    return 'normal';
  }

  if (!sensor) return 'normal';
  if (sensor.alertMuted) return 'normal'; // 儀器維修中，暫停告警（見 deviceTypes.alertMuted）
  const ch = chData as ChannelData;

  switch (typeToUse) {
    case DEVICE_TYPES.WATER: {
      if (ch?.EgF != null && !isNaN(ch.EgF)) {
        const waterLevel = rawToPEgF(ch.EgF, typeToUse, sensor?.wellDepth);
        return bool(waterLevel < -17);
      }
      return 'action';
    }
    case DEVICE_TYPES.GE: {
      const cur = ch?.EgF;
      // 每日累積基準：優先用今日 00:00 的值；後端沒附 dayStart 時 fallback 安裝初始值
      const baseEgF = opts.dayStartEgF ?? sensor.initialValues?.[sensor.channels[0]];
      if (cur == null || isNaN(cur) || baseEgF == null) return 'normal';
      const curMm = rawToPEgF(cur, typeToUse, sensor?.wellDepth, sensor?.fsDeg, sensor?.geRange);
      const baseMm = rawToPEgF(baseEgF, typeToUse, sensor?.wellDepth, sensor?.fsDeg, sensor?.geRange);
      if (isNaN(curMm) || isNaN(baseMm)) return 'normal';
      const dailyAbs = Math.abs(curMm - baseMm); // 表是看 |變化量|（伸/縮都算）
      const t = sensor.dailyThresholds ?? DEFAULT_GE_DAILY_THRESHOLDS;
      if (dailyAbs >= t.action) return 'action';
      if (dailyAbs >= t.alert) return 'alert';
      if (dailyAbs >= t.warn) return 'warn';
      return 'normal';
    }
    case DEVICE_TYPES.TI: {
      if (isGeoStarSource) {
        const delta = ch?.PEgF;
        return bool(delta != null && delta < 1800);
      }
      const raw = ch?.EgF;
      if (raw == null) return 'action';
      const pe = rawToPEgF(raw, typeToUse, sensor?.wellDepth, sensor?.fsDeg);
      const initRaw = sensor.initialValues?.[sensor.channels[0]];
      if (initRaw == null) return 'action';
      const initPe = rawToPEgF(initRaw, typeToUse, sensor?.wellDepth, sensor?.fsDeg);
      if (!isNaN(pe) && !isNaN(initPe)) {
        return bool(pe - initPe < 1800);
      }
      return 'action';
    }
    case DEVICE_TYPES.FLOW:
      // TODO：補流量計判定閾值
      return 'normal';
    case DEVICE_TYPES.BATTERY: {
      const pe = ch?.PEgF;
      if (pe == null || isNaN(pe)) return 'normal';
      if (sensor.scaleMin != null && sensor.scaleMax != null) {
        const pct = ((pe - sensor.scaleMin) / (sensor.scaleMax - sensor.scaleMin)) * 100;
        return bool(pct >= 30);
      }
      return 'normal';
    }
    default:
      return 'normal';
  }
}

/** 向後相容：是否正常（= 警示等級為 normal）。舊呼叫端不用改。 */
export function isNormalData(
  deviceConfig: Device | undefined,
  sensor: Sensor | undefined,
  chData: ChannelData | number | null | undefined,
  rainfallIntervalKey?: string,
): boolean {
  return getAlertLevel(deviceConfig, sensor, chData, { rainfallIntervalKey }) === 'normal';
}

/**
 * 原始 mA → 工程值
 * 此前端版本對 WATER 使用「地下水位」推算，與後端 rawToPEgF 的純線性定義略有差異
 */
export function rawToPEgF(
  raw: number,
  type: DEVICE_TYPES | undefined,
  wellDepth: number = -50,
  fsDeg: number = 15,
  geRange: number = 500,
  flowMax: number = 130,
): number {
  switch (type) {
    case DEVICE_TYPES.WATER: {
      const ratio = (raw - 4) / 16;
      const waterDepth = ratio * wellDepth;
      const groundwaterLevel = wellDepth - waterDepth;
      return groundwaterLevel;
    }
    case DEVICE_TYPES.TI: {
      const fs = fsDeg ?? 15;
      const deg = ((raw - 12) / 16) * (2 * fs);
      return deg * 3600;
    }
    case DEVICE_TYPES.GE: {
      const ratio = (raw - 4) / 16;
      return ratio * geRange;
    }
    case DEVICE_TYPES.FLOW: {
      const ratio = flowMax / 16;
      return ratio * (raw - 4);
    }
    default:
      return raw;
  }
}

/**
 * GE 伸縮計「今日變化量」字串（mm，帶正負號）= 目前值 − 今日00:00值。
 * 嚴格只在有 dayStartEgF（後端有附今日基準）時才回傳；否則回 null，
 * 讓呼叫端 fallback 顯示累積值、避免把累積值誤標成今日。
 */
export function formatGeDailyChange(
  sensor: Sensor | undefined,
  chData: ChannelData | null | undefined,
  dayStartEgF: number | undefined,
): string | null {
  if (!sensor || dayStartEgF == null) return null;
  const cur = chData?.EgF;
  if (cur == null || isNaN(cur)) return null;
  const curMm = rawToPEgF(cur, DEVICE_TYPES.GE, sensor.wellDepth, sensor.fsDeg, sensor.geRange);
  const baseMm = rawToPEgF(dayStartEgF, DEVICE_TYPES.GE, sensor.wellDepth, sensor.fsDeg, sensor.geRange);
  if (isNaN(curMm) || isNaN(baseMm)) return null;
  const d = curMm - baseMm;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)} mm`;
}

/** 依感測器類型回傳要顯示的文字與單位 */
export function formatValue(
  deviceConfig: Device | undefined,
  sensor: Sensor | undefined,
  chData: ChannelData | null | undefined,
  allEntryData: EntryData,
): string {
  if (!deviceConfig || !sensor) return 'N/A';
  const isGeoStarSource = deviceConfig.sourceType === 'geostar';
  const typeToUse = sensor.type || deviceConfig.type;

  // EgF 卡在極端值 (4 / 20 mA) 時顯示 N/A
  if (!isGeoStarSource && (chData?.EgF === 20 || chData?.EgF === 4)) return 'N/A';

  switch (typeToUse) {
    case DEVICE_TYPES.WATER: {
      if (deviceConfig.area === '90K區' && chData?.EgF != null && !isNaN(chData.EgF)) {
        const waterDepth = (chData.EgF - 4) * 2.5;
        const groundwaterLevel = waterDepth - 33.45;
        return `${groundwaterLevel.toFixed(2)} m`;
      }
      if (chData?.EgF != null && !isNaN(chData.EgF)) {
        return `${rawToPEgF(chData.EgF, typeToUse, sensor.wellDepth).toFixed(2)} m`;
      }
      if (chData?.PEgF != null && !isNaN(chData.PEgF)) {
        return `${chData.PEgF.toFixed(2)} m`;
      }
      return 'N/A';
    }
    case DEVICE_TYPES.RAIN: {
      if (allEntryData.rainfall_10m !== undefined && allEntryData.rainfall_10m !== null) {
        return `${allEntryData.rainfall_10m.toFixed(1)} mm`;
      }
      const cnt = chData?.Cnt;
      return cnt != null && !isNaN(cnt) ? `${cnt} counts` : 'N/A';
    }
    case DEVICE_TYPES.GE: {
      const raw = chData?.EgF;
      if (raw != null) {
        const pe = rawToPEgF(raw, typeToUse, sensor.wellDepth, sensor.fsDeg, sensor.geRange);
        const initRaw = sensor.initialValues?.[sensor.channels[0]];
        if (initRaw != null) {
          const initPe = rawToPEgF(initRaw, typeToUse, sensor.wellDepth, sensor.fsDeg, sensor.geRange);
          if (!isNaN(pe) && !isNaN(initPe)) return `${(pe - initPe).toFixed(2)} mm`;
        }
      }
      if (chData?.PEgF != null && !isNaN(chData.PEgF)) return `${chData.PEgF.toFixed(2)} mm`;
      return 'N/A';
    }
    case DEVICE_TYPES.TI: {
      if (isGeoStarSource) {
        const angleValue = chData?.PEgF;
        return angleValue != null && !isNaN(angleValue) ? `${angleValue.toFixed(1)} "` : 'N/A';
      }
      const raw = chData?.EgF;
      if (raw != null) {
        const pe = rawToPEgF(raw, typeToUse, sensor.wellDepth, sensor.fsDeg);
        const initRaw = sensor.initialValues?.[sensor.channels[0]];
        if (initRaw != null) {
          const initPe = rawToPEgF(initRaw, typeToUse, sensor.wellDepth, sensor.fsDeg);
          if (!isNaN(pe) && !isNaN(initPe)) return `${(pe - initPe).toFixed(1)} "`;
        }
      }
      if (chData?.PEgF != null && !isNaN(chData.PEgF)) return `${chData.PEgF.toFixed(1)} "`;
      return 'N/A';
    }
    case DEVICE_TYPES.FLOW: {
      const raw = chData?.EgF;
      if (raw != null && !isNaN(raw)) {
        return `${rawToPEgF(raw, typeToUse, sensor.wellDepth, sensor.fsDeg, sensor.geRange, sensor.flowMax).toFixed(2)} m³/h`;
      }
      return 'N/A';
    }
    case DEVICE_TYPES.BATTERY: {
      if (chData?.PEgF != null && !isNaN(chData.PEgF)) {
        return `${chData.PEgF.toFixed(2)} ${sensor.unit || 'V'}`;
      }
      if (chData?.EgF != null && !isNaN(chData.EgF)) {
        return `${chData.EgF.toFixed(2)} mA`;
      }
      return 'N/A';
    }
    default: {
      const v = chData?.EgF;
      return v != null && !isNaN(v) ? v.toFixed(3) : 'N/A';
    }
  }
}
