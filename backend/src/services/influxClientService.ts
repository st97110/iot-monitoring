// services/influxClientService.ts
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export type SourceKey = 'tdr' | 'wise';

const clients: Record<string, InfluxDB> = {};

function getClient(key: SourceKey): InfluxDB {
  if (!clients[key]) {
    clients[key] = new InfluxDB({
      url: config.influx.url,
      token: config.influx.tokens[key],
    });
  }
  return clients[key];
}

/**
 * 通用：寫一批 Point 到指定 bucket
 */
export async function writePoints(key: SourceKey, points: Point[]): Promise<void> {
  const client: InfluxDB = getClient(key);
  const bucket = config.influx.buckets[key];
  const writeApi: WriteApi = client.getWriteApi(config.influx.org, bucket, 'ns');
  
  writeApi.writePoints(points);
  await writeApi.close();
}

/**
 * 查詢指定 bucket 的 device 標籤
 */
export async function queryDeviceListFromInflux(key: SourceKey): Promise<string[]> {
  const client = getClient(key);
  const queryApi = client.getQueryApi(config.influx.org);
  const bucket = config.influx.buckets[key];

  const fluxQuery = `
    import "influxdata/influxdb/schema"
    schema.tagValues(
      bucket: "${bucket}",
      tag: "device",
      predicate: (r) => true,
      start: -30d
    )
  `;

  const devices: string[] = [];

  await new Promise<void>((resolve, reject) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        devices.push(o._value);
      },
      error(error) {
        logger.error(`[InfluxQuery] queryDeviceListFromInflux error: ${error.message}`);
        reject(error);
      },
      complete() {
        resolve();
      }
    });
  });

  return devices;
}

/**
 * 查詢指定 bucket 的最新資料
 */
export async function queryLatestDataFromInflux(key: SourceKey, deviceId: string): Promise<any> {
  const client = getClient(key);
  const queryApi = client.getQueryApi(config.influx.org);
  const bucket = config.influx.buckets[key];

  let records: any = {}; // 初始化一個空的結果對象

  if (key === 'wise') {
    // WISE 數據的原始查詢和處理邏輯 (多個欄位在同一個 point) 
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
        |> last()
    `;

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          const field = o._field;
          const value = o._value;
          const ts = o._time;

        if (!records.timestamp) {
            records.timestamp = ts;
          }
          records.raw = records.raw || {};
          records.channels = records.channels || {};

          records.raw[field] = value;

        // 只有 AI_x、DI_x 這類才要塞進 channels
          if (field.match(/^[AD]I_\d+ /)) { // Fix regex potentially missing spaces
             const [ch, metric] = field.split(' '); // Split by space
             if (ch && metric) { // Ensure split was successful
                records.channels[ch] = records.channels[ch] || {};
                records.channels[ch][metric] = value;
             } else {
                 logger.warn(`[InfluxQuery] WISE數據: 未預期的欄位格式 '${field}' for device ${deviceId} at ${ts}`);
             }
          }
        },
        error(error) {
          logger.error(`[InfluxQuery] 查詢最新WISE資料失敗 (裝置 ${deviceId}): ${error.message}`);
          reject(error);
        },
        complete: resolve,
      });
    });

    // 返回組裝好的 WISE 數據結構
    return records; // For WISE, return the single record object
  } else if (key === 'tdr') {
    // TDR 數據的查詢和處理邏輯 (一個時間戳多個 point，tag 是 distance_m)

    // Step 1: 找出最新的時間戳
    const latestTimeQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d) // 從最近 30 天找最新
        |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
        |> sort(columns: ["distance_m"], desc: false)
        |> keep(columns: ["_time", "distance_m", "_value"])
        |> last()
    `;

    // TDR 數據的組裝邏輯：組合成一個包含 timestamp 和 data 陣列的對象
    const tdrDataPoints: { distance_m: number, rho: number }[] = [];
    let latestTimestamp: string | null = null;
    await new Promise<void>((resolve, reject) => {
        queryApi.queryRows(latestTimeQuery, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                latestTimestamp = o._time;
                const distance = parseFloat(o.distance_m as string); // distance_m 是 Tag，讀出來是字串
                const rhoValue = parseFloat(o._value as string);      // _value 是 Field 值

                if (!isNaN(distance) && !isNaN(rhoValue)) {
                  tdrDataPoints.push({ distance_m: distance, rho: rhoValue });
                } else {
                  logger.warn(`[InfluxQuery] 裝置 ${deviceId} TDR 最新數據包含無效數值，跳過。距離: ${o.distance_m}, Rho: ${o._value}`);
                }

                tdrDataPoints.sort((a, b) => a.distance_m - b.distance_m);
            },
          
          
            error(error) {
                 // 如果找不到最新時間戳，可能沒有數據，不算致命錯誤
                 logger.error(`[InfluxQuery] 查詢裝置 ${deviceId} 最新 TDR 資料點失敗: ${error.message}`);
                 resolve(); // 不reject
            },
            complete: resolve,
        });
    });

    // 返回 TDR 數據結構包含 timestamp 和 data 陣列
    return {
            timestamp: latestTimestamp,
            data: tdrDataPoints
    };
    
  } else {
      // 不支援的 source key
      throw new Error(`[InfluxQuery] 不支援的資料來源: ${key}`);
  }
}

/**
 * 查詢指定裝置在時間範圍內的所有資料
 */
export async function queryHistoryDataFromInflux(key: SourceKey, deviceId: string, startDate: string, endDate: string): Promise<any[]> {
  const client = getClient(key);
  const queryApi = client.getQueryApi(config.influx.org);
  const bucket = config.influx.buckets[key];

  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
      |> sort(columns: ["_time"])
      |> keep(columns: ["_time", "distance_m", "_field", "_value"])
  `;

  /* 1️⃣ 先把所有 row 收進 history 陣列 */
  const historyRaw: any[] = [];

  await new Promise<void>((resolve, reject) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        historyRaw.push(o);
      },
      error(error) {
        logger.error(`[InfluxQuery] queryHistoryDataFromInflux deviceID: ${deviceId} error: ${error.message}`);
        reject(error);
      },
      complete() {
        resolve();
      }
    });
  });

  // 根據來源類型，將原始行組裝成前端需要的結構
  const groupedHistory: any[] = []; // 儲存組裝後的歷史數據

  if (key === 'wise') {
    // WISE 數據組裝邏輯 (按時間戳分組，收集 fields 到 channels/raw)
    const groupedByTs: Record<string, any> = {}; // tsStr -> record

    historyRaw.forEach(r => {
      const ts   = r._time as string;                 // ISO 時間字串
      const fld  = r._field as string;                // 例如 "AI_0 EgF"
      const val  = r._value;                          // 數值

      if (!groupedByTs[ts]) {
        groupedByTs[ts] = {
          deviceId,
          timestamp: ts,
          channels: {},
          raw: {}
        };
      }

      /* raw: 原樣存所有 field */
      groupedByTs[ts].raw[fld] = val;

      // 只有 AI_x、DI_x 這類才要塞進 channels
      if (fld.match(/^[AD]I_\d+ /)) { // Fix regex
        const [ch, metric] = fld.split(' '); // Split by space
        if (ch && metric) {
            groupedByTs[ts].channels[ch] = groupedByTs[ts].channels[ch] || {};
            groupedByTs[ts].channels[ch][metric] = val;
        } else {
            logger.warn(`[InfluxQuery] WISE歷史數據: 未預期的欄位格式 '${fld}' for device ${deviceId} at ${ts}`);
        }
      }
    });

    // 轉換為陣列並按時間降序排序
    groupedHistory.push(...Object.values(groupedByTs).sort(
          (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  } else if (key === 'tdr') {
    // console.debug('tdr', historyRaw);
    // TDR 數據組裝邏輯 (按時間戳分組，收集 distance_m 和 rho 到 data 陣列)
    const groupedByTs: Record<string, any> = {}; // tsStr -> { timestamp, data: [] }

    historyRaw.forEach(r => {
        const ts   = r._time as string;
        const dist = r.distance_m as string; // distance_m 是 Tag
        const rhoVal = r._value; // _value 是 Field 值 (rho)

        if (!groupedByTs[ts]) {
          groupedByTs[ts] = {
            deviceId,
            timestamp: ts,
            data: [] // 儲存 { distance_m, rho } 陣列
          };
        }

        const distance = parseFloat(dist);
        const rho = parseFloat(rhoVal as string);

        if (!isNaN(distance) && !isNaN(rho)) {
            groupedByTs[ts].data.push({ distance_m: distance, rho: rho });
        } else {
            logger.warn(`[InfluxQuery] 裝置 ${deviceId} TDR 歷史數據包含無效數值，跳過。時間戳: ${ts}, 距離: ${dist}, Rho: ${rhoVal}`);
        }
    });

    // 確保每個時間戳的 data 陣列是按距離排序的
    Object.values(groupedByTs).forEach((record: any) => {
        record.data.sort((a: any, b: any) => a.distance_m - b.distance_m);
    });


    // 轉換為陣列並按時間降序排序
    groupedHistory.push(...Object.values(groupedByTs).sort(
        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  } else {
    logger.error(`[InfluxQuery] queryHistoryDataFromInflux 不支援的資料來源: ${key}`);
  }

  return groupedHistory; // 回傳組裝後的歷史數據陣列
}

/**
 * 取得最近一段時間的雨量 (mm)
 * @param deviceId  WISE-4060 裝置 ID
 * @param duration  區間長度；可給：
 *                  • 字串："30m" | "60m" | "6h" | "24h"…
 *                  • 數字：代表「分鐘」
 * @returns         累積雨量 (mm)，若期間無資料則回 null
 *
 * 範例：
 *   queryRainfall("WISE-4060LAN_...", "30m")
 *   queryRainfall("WISE-4060LAN_...", 1440)   // 1 天
 */
export async function queryRainfall(
  deviceId: string,
  duration: string | number = 10 // 預設為 10 分鐘
): Promise<number | null> {

  // ⇢ 1-a 轉成字串（Influx 支援 1h2m 格式；我們只用 m/h/d）
  const durStr =
    typeof duration === 'number'
      ? `${duration}m`
      : duration.trim();

  // ⇢ 1-b 基本容錯：空值／格式錯誤直接丟 Error
  if (!/^\d+[smhd]$/.test(durStr))
    throw new Error(`duration 格式不合法: ${duration}`);

  const client = getClient('wise');
  const bucket = config.influx.buckets.wise;

  const flux = `
    import "experimental"

    from(bucket: "${bucket}")
      |> range(start: -${durStr})
      |> filter(fn:(r) =>
           r._measurement == "wise_raw" and
           r.device       == "${deviceId}" and
           r._field       == "DI_0 Cnt")
      |> sort(columns:["_time"])
      |> difference(nonNegative:true)
      |> map(fn:(r)=> ({ r with _value: float(v:r._value) / 2.0 }))
      |> sum(column:"_value")         // ← 把這段區間所有 ΔCnt/2 加總
  `;

  let rain: number | null = null;

  await new Promise<void>((res, rej) => {
    client.getQueryApi(config.influx.org).queryRows(flux, {
      next: (row, meta) => {
        rain = meta.toObject(row)._value as number;
      },
      error: (e) => rej(e),
      complete: res
    });
  });

  // 若無資料則保持 null
  return rain;
}

export { Point };