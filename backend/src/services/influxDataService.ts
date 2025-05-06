// services/dataToInfluxService.ts
import { Point, writePoints } from './influxClientService';
import { DEVICE_TYPES, deviceMapping } from '../config/config';
import { toPEgF, getSensorsByDeviceId } from '../utils/helper';
import { logger } from '../utils/logger';

/**
 * 解析 TDR JSON 資料時使用的資料點介面
 */
interface TdrDataPoint {
  distance_m: number;
  rho: number;
}

/**
 * TDR 上傳的 JSON Payload 結構介面
 */
export interface TdrPayload {
  timestamp: string;    // 例如: "2025-05-06T16:50:07"
  data: TdrDataPoint[]; // 包含多個 { distance_m, rho } 的陣列
  // Python 腳本中 payload 也有 device 欄位，但此函數直接使用 deviceId 參數
  // device?: string;
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

      const tsNs = new Date(record.timestamp).getTime() * 1e6;
      const fields = toPEgF(deviceId, record.raw);   // ✨ 取得 PEgF delta 值
      if (Object.keys(fields).length === 0) continue;  // 無有效欄位
      
      const point = new Point('wise_raw')
          .tag('device', deviceId)
          .timestamp(tsNs);

      for (const [field, value] of Object.entries(record.raw)) {
        const floatVal = parseFloat(value as string);
        for (const sensor of getSensorsByDeviceId(deviceId) ?? []) {
          for (const ch of sensor.channels) {
            if (!isNaN(floatVal) && field.startsWith(`${ch} `)) {
              point.floatField(field, floatVal);
            }
          }
        }
      }

      for (const [field, value] of Object.entries(fields)) { // 加入PEgF delta 欄位
        point.floatField(field, value);
      }

      points.push(point);
      logger.debug('deviceId', deviceId, 'point', point);
  }

  return points;
}

/**
 * 將 TDR JSON 資料轉換為 InfluxDB Points。
 * TDR 資料是從一個 JSON 物件中讀取，該物件包含一個頂層的 `timestamp` 欄位和一個 `data` 陣列。
 * `data` 陣列中的每個元素包含 `distance_m` 和 `rho`。
 * 
 * @param deviceId 裝置 ID
 * @param tdrPayload - 解析後的 TDR JSON 物件，包含 `timestamp` (例如 "2025-05-06T16:50:07") 和 `data` 陣列
 * @returns InfluxDB Point 陣列
 */
export function convertTdrToInfluxPoints(deviceId: string, tdrPayload: TdrPayload): Point[] {
  const points: Point[] = [];
  
  // 檢查傳入的 tdrPayload 是否符合預期結構
  if (!tdrPayload || typeof tdrPayload.timestamp !== 'string' || !Array.isArray(tdrPayload.data)) {
    logger.error(`[TDR Influx] 設備 ${deviceId} 的 TDR payload 結構無效。 Payload: %j`, tdrPayload);
    return points; // 返回空陣列
  }

  // 從 payload 中獲取時間戳，並轉換為納秒
  const tsNs = new Date(tdrPayload.timestamp).getTime() * 1e6;

  // 驗證時間戳是否有效
  if (isNaN(tsNs)) {
    logger.error(`[TDR Influx] 設備 ${deviceId} 的 TDR payload 中的時間戳無效: '${tdrPayload.timestamp}'`);
    return points; // 如果時間戳無效，不處理此 payload
  }

  // 如果 data 陣列為空，也記錄一下並返回
  if (tdrPayload.data.length === 0) {
    logger.warn(`[TDR Influx] 設備 ${deviceId} 的 TDR payload (時間戳: ${tdrPayload.timestamp}) 不包含任何數據點。`);
    return points;
  }

  // 遍歷 payload 中的 data 陣列，為每個記錄創建一個 Point
  for (const record of tdrPayload.data) {
    // 驗證每個記錄的結構
    if (typeof record.distance_m !== 'number' || typeof record.rho !== 'number') {
      logger.warn(`[TDR Influx] 設備 ${deviceId} (時間戳: ${tdrPayload.timestamp}) 跳過格式錯誤的 TDR 數據點: %j`, record);
      continue; // 跳過這個格式錯誤的記錄
    }

    const point = new Point('tdr_raw') // Measurement 名稱
      .tag('device', deviceId)                 // 標籤：設備 ID
      .tag('distance_m', record.distance_m.toString()) // 標籤：距離 (公尺)
      .floatField('rho', record.rho)           // 欄位：rho 值
      .timestamp(tsNs);                        // 時間戳 (來自 payload 的頂層 timestamp)

    points.push(point);
  }

  logger.info(`[TDR Influx] 已為設備 ${deviceId} 從時間戳為 ${tdrPayload.timestamp} 的 payload 轉換 ${points.length} 筆 TDR 數據點。`);
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