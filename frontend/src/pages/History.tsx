import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES, DEVICE_TYPE_NAMES, Device, Sensor } from '../config/config';
import { getDeviceTypeBorderColor, formatValue } from '../utils/sensor';
import type { HistoryResponse, WiseLatestRecord } from '../types/api';

// 可排序的欄位
type SortKey = 'time' | 'station' | 'channel' | 'value';
type SortDir = 'asc' | 'desc';

// 扁平化後的一列（每個 sensor × channel 都是獨立一列，TDR 也是一列）
interface TableRow {
  key: string;
  timestamp: string;
  stationName: string;
  stationColorClass: string;
  sensorName: string;
  channel: string;
  displayValue: string;
  numericValue: number | null;
  rawValueText: string;
  isTdr: boolean;
  deviceId: string;
  deviceConfig: Device;
  sensor?: Sensor;
  entry: WiseLatestRecord;
}

interface FilterPreset {
  name: string;
  deviceId: string;
  startDate: string;
  endDate: string;
  searchTerm: string;
}

const PRESETS_KEY = 'monitoring_history_presets_v1';

function History() {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<HistoryResponse>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    setStartDate(today);
    setEndDate(today);
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch (e) { console.warn('讀取 preset 失敗', e); }
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
        const foundDeviceConfig = Object.values(deviceMapping)
          .flatMap(a => a.devices)
          .find(d => d.id === deviceId);
        deviceIdForApi = foundDeviceConfig?.originalDeviceId || deviceId;
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
              const physical = device.originalDeviceId || device.id;
              if (!physicalIdsInRouteGroup.includes(physical)) physicalIdsInRouteGroup.push(physical);
            });
          }
        });
        fetchedData = fetchedData.filter(entry => entry.deviceId && physicalIdsInRouteGroup.includes(entry.deviceId));
      }

      setData(fetchedData);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, startDate, endDate, routeGroup, relevantDeviceIds]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      if (areaConfig.routeGroup !== routeGroup) return;
      const kw = searchTerm.trim().toLowerCase();
      const filteredDevices = kw
        ? areaConfig.devices.filter(d => d.name.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw))
        : areaConfig.devices;
      if (filteredDevices.length > 0) options.push({ areaKey, areaName: areaConfig.name, devices: filteredDevices });
    });
    return options;
  }, [routeGroup, searchTerm]);

  // 把每筆 entry 攤平成多列（一個 sensor channel 一列；TDR 一列）
  const flatRows = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = [];
    for (const entry of data) {
      // 嘗試找 device config：先配對虛擬 ID，找不到再用實體 ID
      let deviceConfig: Device | undefined;
      if (deviceId) {
        deviceConfig = Object.values(deviceMapping).flatMap(a => a.devices)
          .find(d => d.id === deviceId && (d.originalDeviceId || d.id) === entry.deviceId);
      }
      if (!deviceConfig) {
        deviceConfig = Object.values(deviceMapping).flatMap(a => a.devices)
          .find(d => (d.originalDeviceId || d.id) === entry.deviceId && (!routeGroup || (() => {
            // 確認屬於當前 routeGroup
            for (const area of Object.values(deviceMapping)) {
              if (area.routeGroup === routeGroup && area.devices.some(dd => dd.id === d.id)) return true;
            }
            return false;
          })()));
      }
      if (!deviceConfig) continue;

      // 搜尋過濾（站名 / ID）
      if (searchTerm && !deviceId) {
        const kw = searchTerm.toLowerCase();
        if (!deviceConfig.name.toLowerCase().includes(kw) && !deviceConfig.id.toLowerCase().includes(kw)) continue;
      }

      const borderColor = getDeviceTypeBorderColor(deviceConfig);
      const stationColorClass = borderColor.startsWith('border-')
        ? `text-${borderColor.substring(7)}`
        : 'text-slate-700';

      const isTdr = (entry as any).source === 'tdr' || deviceConfig.type === DEVICE_TYPES.TDR;
      if (isTdr) {
        rows.push({
          key: `${entry.timestamp}-${deviceConfig.id}-tdr`,
          timestamp: entry.timestamp || '',
          stationName: deviceConfig.name,
          stationColorClass,
          sensorName: `${deviceConfig.id}`,
          channel: (deviceConfig.type && DEVICE_TYPE_NAMES[deviceConfig.type]) || 'TDR',
          displayValue: '(查看曲線)',
          numericValue: null,
          rawValueText: '-',
          isTdr: true,
          deviceId: entry.deviceId || '',
          deviceConfig,
          entry,
        });
        continue;
      }

      // WISE / geostar
      for (const sensor of deviceConfig.sensors ?? []) {
        for (const ch of sensor.channels) {
          const chData = entry.channels?.[ch];
          const displayValue = formatValue(deviceConfig, sensor, chData, entry);
          const match = typeof displayValue === 'string' ? displayValue.match(/^(-?\d+(\.\d+)?)/) : null;
          const numericValue = match ? parseFloat(match[1]) : null;

          // 原始值
          let rawValueText = '-';
          const isGeoStarSource = deviceConfig.sourceType === 'geostar';
          if (isGeoStarSource) {
            const pegf = chData?.PEgF;
            rawValueText = pegf != null ? `${Number(pegf).toFixed(1)} "` : '-';
          } else if (deviceConfig.type !== DEVICE_TYPES.RAIN && chData) {
            const egfField = entry.raw?.[`${ch} EgF`];
            const egf = chData.EgF !== undefined ? Number(chData.EgF) : (egfField !== undefined ? Number(egfField) : undefined);
            if (egf !== undefined && !isNaN(egf)) rawValueText = `${egf.toFixed(3)} mA`;
          }

          rows.push({
            key: `${entry.timestamp}-${deviceConfig.id}-${ch}`,
            timestamp: entry.timestamp || '',
            stationName: deviceConfig.name,
            stationColorClass,
            sensorName: sensor.name,
            channel: ch,
            displayValue,
            numericValue,
            rawValueText,
            isTdr: false,
            deviceId: entry.deviceId || '',
            deviceConfig,
            sensor,
            entry,
          });
        }
      }
    }
    return rows;
  }, [data, deviceId, routeGroup, searchTerm]);

  const sortedRows = useMemo<TableRow[]>(() => {
    const arr = [...flatRows];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'time': cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(); break;
        case 'station': cmp = a.stationName.localeCompare(b.stationName, 'zh-Hant'); break;
        case 'channel': cmp = a.channel.localeCompare(b.channel); break;
        case 'value': cmp = (a.numericValue ?? -Infinity) - (b.numericValue ?? -Infinity); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [flatRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'time' ? 'desc' : 'asc'); }
  };

  const sortArrow = (key: SortKey): string => (sortKey !== key ? ' ↕' : sortDir === 'asc' ? ' ↑' : ' ↓');

  // ============ CSV 匯出 ============
  const exportCSV = () => {
    if (sortedRows.length === 0) return;
    const headers = ['時間', '站名', '感測器', '通道', '顯示值', '原始值'];
    const rows = sortedRows.map(r => [
      new Date(r.timestamp).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }),
      r.stationName, r.sensorName, r.channel, r.displayValue, r.rawValueText,
    ]);
    const csvBody = [headers, ...rows].map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    ).join('\n');
    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `history_${deviceId || 'all'}_${startDate}_${endDate}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ============ Filter Presets (localStorage) ============
  const savePreset = () => {
    const defaultName = `${deviceId || '全部'}・${startDate}～${endDate}`;
    const name = window.prompt('篩選條件名稱', defaultName);
    if (!name) return;
    const next = [...presets.filter(p => p.name !== name), { name, deviceId, startDate, endDate, searchTerm }];
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch {}
  };

  const loadPreset = (p: FilterPreset) => {
    setDeviceId(p.deviceId); setStartDate(p.startDate); setEndDate(p.endDate); setSearchTerm(p.searchTerm);
  };

  const deletePreset = (name: string) => {
    if (!window.confirm(`刪除篩選「${name}」？`)) return;
    const next = presets.filter(p => p.name !== name);
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch {}
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          歷史資料查詢 {routeGroup === 't14' ? '- 台14線及甲線' : routeGroup === 't8' ? '- 台8線' : ''}
        </h1>
        <p className="text-gray-600 mt-2">查詢各監測設備的歷史數據記錄</p>
      </div>

      {/* 篩選區 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-gray-600">快速範圍：</span>
          <button onClick={() => applyRange(1)} className="px-3 py-1.5 rounded-full text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors">一天</button>
          <button onClick={() => applyRange(7)} className="px-3 py-1.5 rounded-full text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors">一週</button>
          <button onClick={() => applyRange(30)} className="px-3 py-1.5 rounded-full text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors">一個月</button>
          <span className="ml-auto flex gap-2">
            <button onClick={savePreset} className="px-3 py-1.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors">💾 儲存篩選</button>
            <button onClick={exportCSV} disabled={sortedRows.length === 0} className="px-3 py-1.5 rounded-full text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 transition-colors disabled:opacity-40">⬇ CSV</button>
          </span>
        </div>

        {presets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">已存篩選：</span>
            {presets.map(p => (
              <span key={p.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white border border-gray-200 hover:border-blue-300">
                <button onClick={() => loadPreset(p)} className="text-blue-600 hover:text-blue-800">{p.name}</button>
                <button onClick={() => deletePreset(p.name)} className="text-gray-400 hover:text-red-500 text-[10px]" title="刪除">✕</button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">全部裝置</option>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">搜尋裝置</label>
            <input
              type="text"
              placeholder="輸入站名或 ID 過濾..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
            />
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

      {/* 結果表 */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : sortedRows.length > 0 ? (
            <>
              <div className="px-4 py-2 text-xs text-gray-500 border-b flex justify-between items-center">
                <span>共 {sortedRows.length} 筆</span>
                <span>點擊欄位標頭切換排序</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 text-left sticky top-0">
                  <tr>
                    <th onClick={() => toggleSort('time')} className="px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none hover:bg-blue-100">時間{sortArrow('time')}</th>
                    <th onClick={() => toggleSort('station')} className="px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none hover:bg-blue-100">站名{sortArrow('station')}</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">感測器</th>
                    <th onClick={() => toggleSort('channel')} className="px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none hover:bg-blue-100">通道{sortArrow('channel')}</th>
                    <th onClick={() => toggleSort('value')} className="px-4 py-3 font-semibold text-gray-700 text-right cursor-pointer select-none hover:bg-blue-100">數值 (原始值){sortArrow('value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(row => (
                    <tr key={row.key} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(row.timestamp).toLocaleString('zh-TW', {
                          timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                        })}
                      </td>
                      <td className={`px-4 py-3 font-medium ${row.stationColorClass} whitespace-nowrap`}>{row.stationName}</td>
                      <td className="px-4 py-3">{row.sensorName}</td>
                      <td className="px-4 py-3">{row.channel}</td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {row.isTdr ? (
                          <button
                            onClick={() => navigate(`/${routeGroup}/trend?deviceId=${row.deviceId}&timestamp=${encodeURIComponent(row.timestamp)}`)}
                            className="text-blue-600 hover:text-blue-800 underline px-2 py-1 rounded hover:bg-blue-50"
                          >
                            查看曲線
                          </button>
                        ) : (
                          <>
                            {row.displayValue}
                            {row.rawValueText !== '-' && <span className="ml-2 text-gray-400 text-xs">({row.rawValueText})</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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
