import { Point, writePoints } from './influxService';
import { parseCSVFile } from '../utils/csvParser';

/**
 * 解析 Wise CSV 成物件陣列
 * @param filePath CSV 檔案路徑
 */
export async function parseWiseCsv(filePath: string): Promise<any[]> {
    return await parseCSVFile(filePath);
}

/**
 * 將解析後資料轉成 InfluxDB Points
 * @param deviceId 裝置 ID
 * @param records 資料陣列
 */
export function convertToInfluxPoints(deviceId: string, records: any[]): Point[] {
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
 * 將 Points 寫入 InfluxDB
 * @param points Points 陣列
 */
export async function writeWiseDataToInflux(points: Point[]): Promise<void> {
    await writePoints('wise', points);
}