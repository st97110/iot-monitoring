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

  const flux = `
    from(bucket: "${bucket}")
      |> range(start: ${startDate}T00:00:00Z, stop: ${endDate}T23:59:59Z)
      |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
      |> sort(columns: ["_time"])
  `;

  /* 1️⃣ 先把所有 row 收進 history 陣列（你原本的程式） */
  const history: any[] = [];

  await new Promise<void>((resolve, reject) => {
    queryApi.queryRows(flux, {
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

export { Point };