import { useEffect, useState, useCallback, useMemo, ChangeEvent } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES, DEVICE_TYPE_NAMES, Device } from '../config/config';
import { getDeviceTypeBorderColor, formatValue } from '../utils/sensor';
import type { HistoryResponse, WiseLatestRecord } from '../types/api';

function History() {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<HistoryResponse>([]);
  const [deviceId, setDeviceId] = useState<string>('WISE-4060LAN_00D0C9FD4D44');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    setStartDate(today);
    setEndDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relevantDeviceIds = useMemo<string[]>(() => {
    if (!routeGroup) return [];
    const ids: string[] = [];
    Object.values(deviceMapping).forEach(areaConfig => {
      if (areaConfig.routeGroup === routeGroup) {
        areaConfig.devices.forEach(device => ids.push(device.id));
      }
    });
    return ids;
  }, [routeGroup]);

  const syncDates = (start: string, end: string) => {
    if (new Date(start) > new Date(end)) setEndDate(start);
  };

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setData([]);

    try {
      let deviceIdForApi: string | undefined;
      if (deviceId) {
        let foundDeviceConfig: Device | null = null;
        Object.values(deviceMapping).some(area => {
          const dev = area.devices.find(d => d.id === deviceId);
          if (dev) { foundDeviceConfig = dev; return true; }
          return false;
        });
        deviceIdForApi = (foundDeviceConfig as Device | null)?.originalDeviceId || deviceId;
      }

      const res = await axios.get<HistoryResponse>(`${API_BASE}/api/history`, {
        params: { deviceId: deviceIdForApi || undefined, startDate, endDate },
      });

      let fetchedData = res.data || [];

      if (!deviceId && routeGroup) {
        const physicalIdsInRouteGroup: string[] = [];
        Object.values(deviceMapping).forEach(areaConfig => {
          if (areaConfig.routeGroup === routeGroup) {
            areaConfig.devices.forEach(device => {
              if (device.originalDeviceId && !physicalIdsInRouteGroup.includes(device.originalDeviceId)) {
                physicalIdsInRouteGroup.push(device.originalDeviceId);
              } else if (!device.originalDeviceId && !physicalIdsInRouteGroup.includes(device.id)) {
                physicalIdsInRouteGroup.push(device.id);
              }
            });
          }
        });
        fetchedData = fetchedData.filter(entry => entry.deviceId && physicalIdsInRouteGroup.includes(entry.deviceId));
      }

      const sorted = fetchedData.sort(
        (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime(),
      );
      setData(sorted);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, startDate, endDate, routeGroup, relevantDeviceIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const format = (d: Date) => d.toISOString().split('T')[0];
    setStartDate(format(start));
    setEndDate(format(end));
  };

  const filterDeviceOptions = useMemo(() => {
    if (!routeGroup) return [];
    const options: { areaKey: string; areaName: string; devices: Device[] }[] = [];
    Object.entries(deviceMapping).forEach(([areaKey, areaConfig]) => {
      if (areaConfig.routeGroup === routeGroup) {
        const filteredDevices = areaConfig.devices.filter(device =>
          !searchTerm ||
          device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase())),
        );
        if (filteredDevices.length > 0) {
          options.push({ areaKey, areaName: areaConfig.name, devices: filteredDevices });
        }
      }
    });
    return options;
  }, [routeGroup, searchTerm]);

  const getFilteredTableData = (): HistoryResponse => {
    let currentData = data;
    if (searchTerm && !deviceId) {
      currentData = data.filter(entry => {
        let deviceConfig: Device | undefined;
        Object.values(deviceMapping).some(area => {
          if (area.routeGroup === routeGroup) {
            deviceConfig = area.devices.find(d => d.id === entry.deviceId);
            if (deviceConfig) return true;
          }
          return false;
        });
        if (deviceConfig) {
          return (
            deviceConfig.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (deviceConfig.id && deviceConfig.id.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        }
        return entry.deviceId?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false;
      });
    }
    return currentData;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSearch = (e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value);

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          歷史資料查詢 - {routeGroup === 't14' ? '台14線及甲線' : routeGroup === 't8' ? '台8線' : ''}
        </h1>
        <p className="text-gray-600 mt-2">查詢各監測設備的歷史數據記錄</p>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">快速時間範圍：</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyRange(1)} className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">最近一天</button>
          <button onClick={() => applyRange(7)} className="px-4 py-2 rounded-full text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1">最近一週</button>
          <button onClick={() => applyRange(30)} className="px-4 py-2 rounded-full text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1">最近一個月</button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">全部裝置 ({routeGroup === 't14' ? '台14線及甲線' : '台8線'})</option>
              {filterDeviceOptions.map(({ areaKey, areaName, devices }) => (
                <optgroup key={areaKey} label={areaName}>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>{device.name} ({device.id})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); syncDates(e.target.value, endDate); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); syncDates(startDate, e.target.value); }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : getFilteredTableData().length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">時間</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">站名</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">設備/感測器名稱</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">類型/通道</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">數值 (原始值)</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredTableData().map((entry: WiseLatestRecord, index: number) => {
                  let deviceConfig: Device | undefined;
                  if (deviceId) {
                    Object.values(deviceMapping).some(area => {
                      const dev = area.devices.find(d => d.id === deviceId && (d.originalDeviceId || d.id) === entry.deviceId);
                      if (dev) { deviceConfig = dev; return true; }
                      return false;
                    });
                  } else {
                    Object.values(deviceMapping).some(area => {
                      if (area.routeGroup === routeGroup) {
                        const dev = area.devices.find(d => (d.originalDeviceId || d.id) === entry.deviceId);
                        if (dev) { deviceConfig = dev; return true; }
                      }
                      return false;
                    });
                  }

                  if (!deviceConfig) {
                    deviceConfig = Object.values(deviceMapping)
                      .flatMap(area => area.devices)
                      .find(d => (d.originalDeviceId || d.id) === entry.deviceId);
                    if (!deviceConfig) { console.warn('Cannot find deviceConfig for entry:', entry); return null; }
                  }

                  const isTdrEntry = (entry as any).source === 'tdr' || deviceConfig.type === DEVICE_TYPES.TDR;

                  let stationNameColorClass = 'text-slate-700';
                  const borderColorClass = getDeviceTypeBorderColor(deviceConfig);
                  if (borderColorClass.startsWith('border-')) {
                    stationNameColorClass = `text-${borderColorClass.substring('border-'.length)}`;
                  }

                  if (isTdrEntry) {
                    return (
                      <tr key={`${index}-tdr-${entry.timestamp}`} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {new Date(entry.timestamp!).toLocaleString('zh-TW', {
                            timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                          })}
                        </td>
                        <td className={`px-4 py-3 font-medium ${stationNameColorClass}`}>{deviceConfig.name}</td>
                        <td className="px-4 py-3">{deviceConfig.id} ({(deviceConfig.type && DEVICE_TYPE_NAMES[deviceConfig.type]) || 'TDR'})</td>
                        <td className="px-4 py-3 text-center">-</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              navigate(`/trend?deviceId=${entry.deviceId}&timestamp=${encodeURIComponent(entry.timestamp!)}`);
                            }}
                            className="text-blue-600 hover:text-blue-800 underline px-2 py-1 rounded hover:bg-blue-50"
                          >
                            查看曲線
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const cfg = deviceConfig;
                  return cfg.sensors?.flatMap((sensor, sIdx) =>
                    sensor.channels.map(ch => {
                      const chData = entry.channels?.[ch];
                      const displayValue = formatValue(cfg, sensor, chData, entry);
                      let rawValueText = '-';
                      const isGeoStarSource = cfg.sourceType === 'geostar';
                      if (isGeoStarSource) {
                        const pegf = chData?.PEgF;
                        rawValueText = pegf !== undefined && pegf !== null ? `${Number(pegf).toFixed(1)} "` : '-';
                      } else if (cfg.type !== DEVICE_TYPES.RAIN && chData) {
                        const egfField = entry.raw?.[`${ch} EgF`];
                        const egf = chData.EgF !== undefined ? Number(chData.EgF) : (egfField !== undefined ? Number(egfField) : undefined);
                        if (egf !== undefined && !isNaN(egf)) rawValueText = `${egf.toFixed(3)} mA`;
                      }
                      return (
                        <tr key={`${index}-${sIdx}-${ch}`} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            {new Date(entry.timestamp!).toLocaleString('zh-TW', {
                              timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
                              hour: '2-digit', minute: '2-digit', hour12: false,
                            })}
                          </td>
                          <td className={`px-4 py-3 font-medium ${stationNameColorClass}`}>{cfg.name}</td>
                          <td className="px-4 py-3">{sensor.name}</td>
                          <td className="px-4 py-3">{ch}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {displayValue}
                            {cfg.type !== DEVICE_TYPES.RAIN && !isGeoStarSource && (
                              <span className="ml-2 text-gray-600">({rawValueText})</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">無符合條件的資料</div>
              <button
                onClick={() => { setSearchTerm(''); setDeviceId(''); setStartDate(today); setEndDate(today); }}
                className="mt-3 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg"
              >
                重設篩選條件
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 py-4 border-t text-center text-sm text-gray-500">
        © {new Date().getFullYear()} 監測系統儀表板
      </div>
    </div>
  );
}

export default History;
