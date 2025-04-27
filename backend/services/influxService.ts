// services/influxService.js
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

export { Point };