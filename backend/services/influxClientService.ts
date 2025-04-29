// services/influxService.ts
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { config } from '../config/config';

const clients: Record<string, InfluxDB> = {};

function getClient(key: 'tdr' | 'wise'): InfluxDB {
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
export async function writePoints(key: 'tdr' | 'wise', points: Point[]): Promise<void> {
  const client: InfluxDB = getClient(key);
  const bucket = config.influx.buckets[key];
  const writeApi: WriteApi = client.getWriteApi(config.influx.org, bucket, 'ns');
  
  writeApi.writePoints(points);
  await writeApi.close();
}

/**
 * 查詢指定 bucket 的 device 標籤
 */
export async function queryDeviceListFromInflux(key: 'tdr' | 'wise' | 'both'): Promise<string[]> {
  if (key === 'both') {
    const [wiseDevices, tdrDevices] = await Promise.all([
      queryDeviceListFromInflux('wise'),
      queryDeviceListFromInflux('tdr')
    ]);
    return [...new Set([...wiseDevices, ...tdrDevices])]; // 合併去重
  }

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
        reject(error);
      },
      complete() {
        resolve();
      }
    });
  });

  return devices;
}


export { Point };