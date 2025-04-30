// backend/utils/areaHelper.ts
import { deviceMapping } from '../config/config';

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
 * Helper：由 deviceId 反查 mapping
 */
export function getTypeByDeviceId(id: string) {
  for (const area of Object.values(deviceMapping)) {
    const cfg = area.devices.find(d => d.id === id);
    if (cfg) return cfg;
  }
  return undefined;
}