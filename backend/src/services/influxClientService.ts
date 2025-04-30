// services/influxService.ts
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
export async function queryLatestDataFromInflux(key: SourceKey, deviceId: string): Promise<string[]> {
  const client = getClient(key);
  const queryApi = client.getQueryApi(config.influx.org);
  const bucket = config.influx.buckets[key];

  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
      |> last()
  `;

  const records: any = {};
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
        if (!records.raw)   records.raw = {};
        if (!records.channels) records.channels = {};

        records.raw[field] = value;

        // 只有 AI_x、DI_x 這類才要塞進 channels
        if (field.match(/^[AD]I_\d+ /)) {
          const [ch, metric] = field.split(' ');
          records.channels[ch] = records.channels[ch] || {};
          records.channels[ch][metric] = value;
        }
        records.raw = records.raw || {};
        records.raw[field] = value;
      },
      error(error) {
        logger.error(`[InfluxQuery] queryLatestValuesFromInflux error: ${error.message}`);
        reject(error);
      },
      complete: resolve,
    });
  });

  return records;
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
  `;

  /* 1️⃣ 先把所有 row 收進 history 陣列（你原本的程式） */
  const history: any[] = [];

  await new Promise<void>((resolve, reject) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        history.push(o);
      },
      error(error) {
        logger.error(`[InfluxQuery] queryHistoryDataFromInflux error: ${error.message}`);
        reject(error);
      },
      complete() {
        resolve();
      }
    });
  });

  console.log('queryHistoryDataFromInflux', history);

  /* 2️⃣ 重新 groupBy timestamp，轉成前端需要的 channels/raw 結構 */
  const grouped: Record<string, any> = {};          // tsStr -> record

  history.forEach(r => {
    const ts   = r._time as string;                 // ISO 時間字串
    const fld  = r._field as string;                // 例如 "AI_0 EgF"
    const val  = r._value;                          // 數值

    if (!grouped[ts]) {
      grouped[ts] = {
        deviceId,
        timestamp: ts,
        channels: {},
        raw: {}
      };
    }

    /* raw: 原樣存所有 field */
    grouped[ts].raw[fld] = val;

    /* channels: 只把 AI_x、DI_x 等需要合併的欄位拆進去 */
    const m = fld.match(/^([AD]I_\d+)\s(\w+)$/);
    if (m) {
      const [_, ch, metric] = m;
      grouped[ts].channels[ch] = grouped[ts].channels[ch] || {};
      grouped[ts].channels[ch][metric] = val;
    }
  });

  /* 3️⃣ 依時間降序回傳陣列 */
  return Object.values(grouped).sort(
    (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
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