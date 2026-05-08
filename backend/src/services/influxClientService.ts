// services/influxClientService.ts
import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { isDeviceRainGauge, getDeviceConfigById } from '../utils/helper';
import { formatInTimeZone } from 'date-fns-tz';

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

  let fluxQuery: string;

  if (key === 'wise') {
    // ✨ 對於 'wise' 數據源，我們需要合併 'device' tag (標準 WISE) 和 'device_sn' tag (ETI)
    fluxQuery = `
      import "influxdata/influxdb/schema"
      
      standard_wise = schema.tagValues(
        bucket: "${bucket}",
        tag: "device",
        predicate: (r) => r._measurement == "wise_raw" and r.device =~ /^WISE-/, // ✨ 可選：更精確地過濾
        start: -30d
      )

      eti_devices = schema.tagValues(
        bucket: "${bucket}",
        tag: "device_sn",
        predicate: (r) => r._measurement == "wise_raw" and r._field == "value", // ✨ ETI 的特徵
        start: -30d
      )
      // ✨ 將 ETI 的 device_sn 加上 "SN_" 前綴，以匹配前端的邏輯 ID
      |> map(fn: (r) => ({ _value: "SN_" + r._value }))

      // 合併兩個列表
      union(tables: [standard_wise, eti_devices])
        |> distinct(column: "_value") // 去重
        |> sort()
    `;
  } else if (key === 'tdr') {
    // TDR 只查詢 'device' tag
    fluxQuery = `
      import "influxdata/influxdb/schema"
      schema.tagValues(
        bucket: "${bucket}",
        tag: "device",
        predicate: (r) => r._measurement == "tdr_raw", // ✨ 可選：過濾
        start: -30d
      )
    `;
  }

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

  // ✨ 增加對這種新類型設備的特殊處理
  // 我們可以通過 ID 的前綴來判斷，例如 'SN_'
  const isEtiTiltmeter = deviceId.startsWith('SN_');
  const physicalSn = isEtiTiltmeter ? deviceId.replace('SN_', '') : null;

  if (isEtiTiltmeter && physicalSn) {
    // ✨ 為新傾斜儀構建特定的 Flux 查詢

    const fluxQuery = `
      data = from(bucket: "${bucket}")
        |> range(start: -30d) // 依需求可調整，例如 -7d
        |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device_sn == "${physicalSn}")

      // 找到最新時間戳
      latest = data
        |> keep(columns: ["_time"])
        |> group()
        |> max(column: "_time")
        |> findRecord(fn: (key) => true, idx: 0)

      // 使用最新時間戳篩選原始資料
      if exists latest._time then
        data
          |> filter(fn: (r) => r._time == latest._time)
      else
        from(bucket: "nonexistent") |> range(start: -1s) // 返回空結果
    `;

    const deviceConfig = getDeviceConfigById(deviceId);

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          const ts = o._time as string;
          const sourceChannelTag = o.channel as string; // 'ETI-2A軸角度'
          const val = o._value; // 數值

          // 初始化 records 對象 (只在處理第一行時執行)
          if (!records.timestamp) {
            records = {
              deviceId: deviceId, // 使用邏輯 ID
              timestamp: ts,
              source: 'geostar', // 標識來源
              channels: {},
              raw: {}
            };
          }

          // 反向映射，將 sourceChannelTag 轉換回前端期望的通用 channel key (AI_0)
          let targetChannelKey: string | undefined;
          for (const sensor of deviceConfig?.sensors || []) {
            if (sensor.sourceChannelMapping) {
              for (const [frontendKey, sourceKey] of Object.entries(sensor.sourceChannelMapping)) {
                if (sourceKey === sourceChannelTag) {
                  targetChannelKey = frontendKey;
                  break;
                }
              }
            }
            if (targetChannelKey) break;
          }

          if (targetChannelKey) {
            // 組裝 channels 對象
            if (!records.channels[targetChannelKey]) {
              records.channels[targetChannelKey] = {};
            }
            records.channels[targetChannelKey].PEgF = val; // 將 ETI 的 value 視為 PEgF

            // 組裝 raw 對象
            records.raw[`${targetChannelKey} PEgF`] = val;
          } else {
            logger.warn(`[InfluxData Latest] ETI 數據：在 ${deviceId} 的配置中找不到對應 source channel tag '${sourceChannelTag}' 的前端 channel key。`);
          }
        },
        error(error) {
          logger.error(`[InfluxQuery Latest] 查詢 ETI 設備 ${deviceId} 最新數據點失敗: ${error.message}`);
          reject(error);
        },
        complete: resolve,
      });
    });

    return records;
  } else if (key === 'wise') {
    // WISE 數據的原始查詢和處理邏輯 (多個欄位在同一個 point) 
    const fluxQuery = `
      data = from(bucket: "${bucket}")
        |> range(start: -30d) // 依需求可調整，例如 -7d
        |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")

      // 找到最新時間戳
      latest = data
        |> keep(columns: ["_time"])
        |> group()
        |> max(column: "_time")
        |> findRecord(fn: (key) => true, idx: 0)

      // 使用最新時間戳篩選原始資料
      if exists latest._time then
        data
          |> filter(fn: (r) => r._time == latest._time)
      else
        from(bucket: "nonexistent") |> range(start: -1s) // 返回空結果
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
    let latestTimestamp: string | null = null;
    const tdrDataPoints: { distance_m: number, rho: number }[] = [];

    // Step 1: 找出最新的時間戳
    const latestTimeQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "tdr_raw" and r.device == "${deviceId}")
        |> group()
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
        |> keep(columns: ["_time"])
    `;

    await new Promise<void>((resolveStep1, rejectStep1) => {
      queryApi.queryRows(latestTimeQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          if (o._time) {
            latestTimestamp = o._time as string;
          }
        },
        error(error) {
          logger.error(`[InfluxQuery] 查詢裝置 ${deviceId} 最新 TDR 時間戳失敗 (Step 1): ${error.message}`);
          rejectStep1(error); // 如果第一步就失敗，直接 reject
        },
        complete() {
          if (latestTimestamp) {
            // logger.debug(`[InfluxQuery] 找到裝置 ${deviceId} 最新 TDR 時間戳: ${latestTimestamp}`);
            resolveStep1();
          } else {
            resolveStep1(); // 即使沒找到也 resolve，後續 data 會是空的
          }
        },
      });
    });

    // 如果沒有找到最新時間戳，直接返回
    if (!latestTimestamp) {
      return { [deviceId]: { timestamp: null, deviceId, source: key, data: [] } };
    }

    // Step 2: 查詢這個最新時間戳下的所有數據點
    const latestDataQuery = `
      from(bucket: "${bucket}")
        |> range(start: time(v: "${latestTimestamp}"), stop: time(v: "${new Date(new Date(latestTimestamp).getTime() + 1000).toISOString()}")) // ✨ 設置 stop 為 latestTimestamp + 1秒
        |> filter(fn: (r) => r._measurement == "tdr_raw" and r.device == "${deviceId}")
        |> filter(fn: (r) => r._time == time(v: "${latestTimestamp}"))
        |> filter(fn: (r) => r._field == "rho")
        |> sort(columns: ["distance_m"], desc: false)
    `;  

    await new Promise<void>((resolveStep2, rejectStep2) => {
      queryApi.queryRows(latestDataQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          const distance = parseFloat(o.distance_m as string);
          const rhoValue = parseFloat(o._value as string);
          if (!isNaN(distance) && !isNaN(rhoValue)) {
            tdrDataPoints.push({ distance_m: distance, rho: rhoValue });
          } else {
            logger.warn(`[InfluxQuery] 裝置 ${deviceId} TDR 最新數據包含無效數值，跳過。TS: ${latestTimestamp}, Dist: ${o.distance_m}, Rho: ${o._value}`);
          }
        },
        error(error) {
          logger.error(`[InfluxQuery] 查詢裝置 ${deviceId} 最新 TDR 資料點失敗 (Step 2, TS: ${latestTimestamp}): ${error.message}`);
          rejectStep2(error);
        },
        complete() {
          // logger.debug(`[InfluxQuery] 裝置 ${deviceId} 最新 TDR 資料點收集完成 (TS: ${latestTimestamp})。點數: ${tdrDataPoints.length}`);
          resolveStep2();
        },
      });
    });

    return {
      timestamp: latestTimestamp,
      deviceId: deviceId,
      source: key,
      data: tdrDataPoints
    };

  } else {
    throw new Error(`[InfluxQuery] 不支援的資料來源: ${key}`);
  }
}

/**
 * 查詢指定裝置在時間範圍內的所有資料
 */
export async function queryHistoryDataFromInflux(
  key: SourceKey,
  deviceId: string,
  startDate: string,
  endDate: string,
  rainInterval?: string,
  /** 時間窗聚合（例：'1h', '15m', '6h', '1d'）。長範圍查詢用，降採樣減少回傳筆數與前端渲染負擔 */
  aggregate?: string,
): Promise<any[]> {
  const client = getClient(key);
  const queryApi = client.getQueryApi(config.influx.org);
  const bucket = config.influx.buckets[key];

  // ✨ 假設前端傳來的 startDate 和 endDate 是 'YYYY-MM-DD' 格式，代表本地日期
  // ✨ 將本地日期的開始和結束轉換為 UTC ISO 字符串給 InfluxDB
  // ✨ 假設服務器和用戶期望的本地時區是 'Asia/Taipei' (UTC+8)
  // ✨ 您可以將 'Asia/Taipei' 放入 config 中
  const timeZone = 'Asia/Taipei';

  // startDate 的 00:00:00 本地時間，轉換為 UTC
  const utcStart = formatInTimeZone(
    new Date(`${startDate}T00:00:00`), timeZone, 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx', );

  // endDate 的 23:59:59.999 本地時間，轉換為 UTC
  const endDateTime = new Date(`${endDate}T23:59:59.999`); // 本地時間的結束
  const utcEnd = formatInTimeZone(endDateTime, timeZone, 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx');

  let fluxQuery: string;

  // ✨ 增加對這種新類型設備的特殊處理
  // 我們可以通過 ID 的前綴來判斷，例如 'SN_'
  const isEtiTiltmeter = deviceId.startsWith('SN_');
  const physicalSn = isEtiTiltmeter ? deviceId.replace('SN_', '') : null;

  if (isEtiTiltmeter && physicalSn) {
    // ✨ 為新傾斜儀構建特定的 Flux 查詢
    fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: time(v: "${utcStart}"), stop: time(v: "${utcEnd}"))
        |> filter(fn: (r) => r._measurement == "wise_raw" and 
                              r.device_sn == "${physicalSn}" and 
                              r._field == "value") // ✨ 過濾 field 為 "value"
        |> sort(columns: ["_time"], desc: false)
    `;
  } else if (key === 'wise' && isDeviceRainGauge(deviceId) && rainInterval) {
    fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: time(v: "${utcStart}"), stop: time(v: "${utcEnd}"))
        |> filter(fn: (r) => r._measurement == "wise_raw" and r.device == "${deviceId}")
        |> filter(fn: (r) => r._field == "rainfall_10m")
        |> aggregateWindow(every: ${rainInterval}, fn: sum, createEmpty: false, timeSrc: "_start") // 使用 _start 作為新時間戳
        |> map(fn: (r) => ({
            _time: r._time, // 聚合窗口的開始時間
            _measurement: "wise_raw", // 或一個新的聚合 measurement
            device: "${deviceId}",
            source: "wise", // 添加 source
            "${"rainfall_" + rainInterval.replace(/\s+/g, '')}": r._value
        }))
        |> sort(columns: ["_time"], desc: false) // 按時間升序
    `;
    // logger.debug(`[InfluxQuery] Rain Gauge History (Aggregated by ${rainInterval}) for ${deviceId}:\n${fluxQuery}`);

  } else { // TDR 或非雨量筒的 WISE，或雨量筒但未指定 rainInterval (預設查明細)
    // 只有 wise（非 TDR）才支援聚合；TDR 是 distance_m 為 X 軸不適用時間聚合
    const aggLine = (aggregate && key === 'wise' && /^\d+[smhd]$/.test(aggregate))
      ? `|> aggregateWindow(every: ${aggregate}, fn: mean, createEmpty: false)`
      : '';
    fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: time(v: "${utcStart}"), stop: time(v: "${utcEnd}"))
        |> filter(fn: (r) => r._measurement == "${key}_raw" and r.device == "${deviceId}")
        |> filter(fn: (r) => r._field == "rho" or r._measurement != "tdr_raw")
        ${aggLine}
        |> sort(columns: ["_time", "distance_m"], desc: false)
    `;
    // logger.debug(`[InfluxQuery] Default History Query for ${deviceId} (Source: ${key}, aggregate: ${aggregate || 'none'}):\n${fluxQuery}`);
  }

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

  const deviceConfig = getDeviceConfigById(deviceId);

  // --- 數據組裝 ---
  const groupedHistory: any[] = []; // 儲存組裝後的歷史數據
  
  if (isEtiTiltmeter) {
    // ✨ 新傾斜儀的數據組裝邏輯
    const groupedByTs: Record<string, any> = {};
    
    historyRaw.forEach(r => {
      const ts = r._time as string;
      const sourceChannelTag = r.channel as string; // 'ETI-2A軸角度' 或 'ETI-2B軸角度'
      const val = r._value;

      // 如果這個時間戳的 entry 還不存在，則創建它
      if (!groupedByTs[ts]) {
        groupedByTs[ts] = {
          deviceId: deviceId, // 返回前端的邏輯 ID (SN_24782)
          timestamp: ts,
          source: 'geostar', // 統一為 'wise'
          channels: {},   // 初始化為空
          raw: {}       // 初始化為空
        };
      }

      // ✨ 關鍵：反向映射，將 sourceChannelTag 轉換回前端期望的通用 channel key
      let targetChannelKey: string | undefined;
      // 遍歷當前設備配置的所有 sensors
      for (const sensor of deviceConfig?.sensors || []) {
        // 檢查 sensor.sourceChannelMapping 是否存在
        if (sensor.sourceChannelMapping) {
          // 遍歷映射關係
          for (const [frontendKey, sourceKey] of Object.entries(sensor.sourceChannelMapping)) {
            if (sourceKey === sourceChannelTag) {
              targetChannelKey = frontendKey; // 找到了！ 'ETI-2A軸角度' -> 'AI_0'
              break;
            }
          }
        }
        if (targetChannelKey) break;
      }

      if (targetChannelKey) {
        // ✨ 將數據組裝到同一個時間戳的 entry 中
        // 確保 channels 下的 channel key (如 AI_0) 的對象被初始化
        if (!groupedByTs[ts].channels[targetChannelKey]) {
          groupedByTs[ts].channels[targetChannelKey] = {};
        }
        
        // ✨ 我們將 ETI 的原始 'value' 視為 'PEgF'
        groupedByTs[ts].channels[targetChannelKey].PEgF = val;
        
        // ✨ 同時填充 raw 對象，使其結構與標準 WISE 設備一致
        groupedByTs[ts].raw[`${targetChannelKey} EgF`] = val;
      } else {
        logger.warn(`[InfluxData] ETI 數據：在 ${deviceId} 的配置中找不到對應 source channel tag '${sourceChannelTag}' 的前端 channel key。`);
      }
    });

    // 轉換為陣列並排序
    groupedHistory.push(...Object.values(groupedByTs).sort(
      (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  }
  else if (key === 'wise' && isDeviceRainGauge(deviceId) && rainInterval) {
    // 如果是聚合後的雨量數據，每個 row 應該直接是 { _time, device, source, rainfall_XX }
    historyRaw.forEach(r => {
        const ts = r._time as string;
        const aggregatedRainfallField = `rainfall_${rainInterval.replace(/\s+/g, '')}`;

        if (r[aggregatedRainfallField] !== undefined && r[aggregatedRainfallField] !== null) {
          groupedHistory.push({
            deviceId: r.device || deviceId, // 確保 deviceId 存在
            timestamp: ts,
            source: r.source || key,       // 確保 source 存在
            // 直接使用聚合後的欄位，前端可以用它來計算累計和區間顯示
            [aggregatedRainfallField]: parseFloat(r[aggregatedRainfallField] as string),
            // 為了與前端 `TrendPage` 中處理雨量的 `row.interval_rainfall` 和 `row.accumulated_rainfall` 對應
            // 我們可以在這裡就構建成前端期望的 `interval_rainfall`
            interval_rainfall: parseFloat(r[aggregatedRainfallField] as string)
          });
        } else {
          logger.warn(`[InfluxQuery] 設備 ${deviceId} 聚合雨量數據點缺少 ${aggregatedRainfallField} 欄位或值為null。Row: %j`, r);
        }
    });
    // 聚合後的數據已經按時間排序了，但前端可能需要降序
    groupedHistory.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } else if (key === 'wise') {
    
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


    // 轉換為陣列並按時間升序排序
    groupedHistory.push(...Object.values(groupedByTs).sort(
        (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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