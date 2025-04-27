// services/tdrService.ts
import { Point, writePoints } from './influxService';

interface TdrDataPoint {
  distance_m: number;
  rho: number;
}

/**
 * 處理 TDR 上傳：data 是 list of { distance_m, rho }
 * timestamp 格式： "2025-04-22T12:00:00"
 */
export async function handleTdrUpload(device: string, timestamp: string, data: TdrDataPoint[]): Promise<void> {
  const ts = new Date(timestamp);
  const tsNs = ts.getTime() * 1e6;

  const points = data.map(({ distance_m, rho }) =>
    new Point('tdr_raw')
      .tag('device', device)
      .tag('distance_m', distance_m.toString())
      .floatField('rho', rho)
      .timestamp(tsNs)
  );

  await writePoints('tdr', points);
}
