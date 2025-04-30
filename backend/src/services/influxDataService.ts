// services/dataToInfluxService.ts
import { Point, writePoints } from './influxClientService';

/**
 * 解析 TDR JSON 資料
 * (TDR 上傳時是 JSON，不需要解析檔案)
 */

interface TdrDataPoint {
  distance_m: number;
  rho: number;
}

/**
 * 將 WISE 資料轉成 Influx Points
 * @param deviceId 裝置 ID
 * @param records 資料陣列
 */
export function convertWiseToInfluxPoints(deviceId: string, records: any[]): Point[] {
  const points: Point[] = [];

  for (const record of records) {
      if (!record.timestamp || !record.raw) continue;

      const ts = new Date(record.timestamp);
      const tsNs = ts.getTime() * 1e6;
  
      const point = new Point('wise_raw')
          .tag('device', deviceId)
          .timestamp(tsNs);
  
      for (const [field, value] of Object.entries(record.raw)) {
          const floatVal = parseFloat(value as string);
          if (!isNaN(floatVal)) {
          point.floatField(field, floatVal);
          }
      }
  
      points.push(point);
  }

  return points;
}

/**
 * 將 TDR 資料轉成 Influx Points
 * 處理 TDR 上傳：data 是 list of { distance_m, rho }
 * timestamp 格式： "2025-04-22T12:00:00"
 */
export function convertTdrToInfluxPoints(deviceId: string, records: TdrDataPoint[]): Point[] {
  const points: Point[] = [];

  for (const record of records) {
    const ts = Date.now() * 1e6; // 這邊要看你的 TDR 上傳資料結構有沒有 timestamp

    const point = new Point('tdr_raw')
      .tag('device', deviceId)
      .tag('distance_m', record.distance_m.toString())
      .floatField('rho', record.rho)
      .timestamp(ts);

    points.push(point);
  }

  return points;
}

/**
 * 將 WISE Points 寫入 InfluxDB
 */
export async function writeWiseDataToInflux(points: Point[]): Promise<void> {
  await writePoints('wise', points);
}

/**
 * 將 TDR Points 寫入 InfluxDB
 */
export async function writeTdrDataToInflux(points: Point[]): Promise<void> {
  await writePoints('tdr', points);
}