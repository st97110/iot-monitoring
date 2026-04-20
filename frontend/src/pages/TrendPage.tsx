// TrendPage.tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES, DEVICE_TYPE_NAMES, Device } from '../config/config';
import { format } from 'date-fns';
import { formatValue } from '../utils/sensor';
import type { HistoryResponse, WiseLatestRecord } from '../types/api';

type ChartRow = Record<string, any>;

const getChartLineColor = (deviceType: DEVICE_TYPES | string | undefined, isAccumulated = false, isInterval = false): string => {
  const typeBaseColors: Record<string, string> = {
    [DEVICE_TYPES.TI]: '#3B82F6',
    [DEVICE_TYPES.WATER]: '#06B6D4',
    [DEVICE_TYPES.RAIN]: isAccumulated ? '#0EA5E9' : (isInterval ? '#6366F1' : '#4F46E5'),
    [DEVICE_TYPES.GE]: '#22C55E',
    [DEVICE_TYPES.TDR]: '#8B5CF6',
    [DEVICE_TYPES.BATTERY]: '#F59E0B',
  };
  return (deviceType && typeBaseColors[deviceType]) || '#6B7280';
};

const formatDateTimeForCSV = (isoString: string | undefined): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch (e) {
    console.error('Error formatting date for CSV:', isoString, e);
    return isoString;
  }
};

function TrendPage() {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [deviceId, setDeviceId] = useState<string>(searchParams.get('deviceId') || '');
  const [sensorIndex, setSensorIndex] = useState<number>(parseInt(searchParams.get('sensorIndex') || '0', 10));
  const [startDate, setStartDate] = useState<string>(searchParams.get('startDate') || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(searchParams.get('endDate') || new Date().toISOString().split('T')[0]);

  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [data, setData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  const [selectedTimestamp, setSelectedTimestamp] = useState<string>(searchParams.get('timestamp') || '');
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  const [fullHistoryData, setFullHistoryData] = useState<HistoryResponse>([]);
  const [selectedRainInterval, setSelectedRainInterval] = useState<string>(searchParams.get('rainInterval') || '10m');

  const findCurrentDevice = useCallback((idToFind: string): Device | null => {
    if (!idToFind) return null;
    for (const area of Object.values(deviceMapping)) {
      const device = area.devices.find(dev => dev.id === idToFind);
      if (device) return device;
    }
    console.warn(`TrendPage: Device ID "${idToFind}" not found in mapping.`);
    return null;
  }, []);

  useEffect(() => {
    const foundDevice = findCurrentDevice(deviceId);
    setCurrentDevice(foundDevice);

    if (foundDevice?.type === DEVICE_TYPES.TDR) {
      const tsFromUrl = searchParams.get('timestamp');
      if (!tsFromUrl) setSelectedTimestamp('');
    } else {
      setSelectedTimestamp('');
      setAvailableTimestamps([]);
    }
  }, [deviceId, findCurrentDevice, searchParams]);

  const handleSearch = useCallback(async () => {
    if (!deviceId || !currentDevice || !startDate || !endDate) {
      setData([]); setLoading(false); return;
    }
    setLoading(true);
    setData([]); setAvailableTimestamps([]); setFullHistoryData([]);

    try {
      const deviceIdForApi = currentDevice.originalDeviceId || currentDevice.id;
      const activeSensorType = currentDevice.sensors?.[sensorIndex]?.type || currentDevice.type;

      const res = await axios.get<HistoryResponse>(`${API_BASE}/api/history`, {
        params: {
          deviceId: deviceIdForApi,
          startDate,
          endDate,
          rainInterval: activeSensorType === DEVICE_TYPES.RAIN ? selectedRainInterval : undefined,
        },
      });
      const historyRecords = (res.data || []).sort(
        (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime(),
      );
      setFullHistoryData(historyRecords);

      if (activeSensorType === DEVICE_TYPES.TDR) {
        const timestamps = historyRecords
          .map(entry => entry.timestamp)
          .filter((t): t is string => Boolean(t))
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const uniqueTimestamps = [...new Set(timestamps)];
        setAvailableTimestamps(uniqueTimestamps);

        const timestampFromUrl = searchParams.get('timestamp');
        if (timestampFromUrl && uniqueTimestamps.includes(timestampFromUrl)) {
          setSelectedTimestamp(timestampFromUrl);
        } else if (uniqueTimestamps.length > 0) {
          setSelectedTimestamp(uniqueTimestamps[0]);
        } else {
          setSelectedTimestamp('');
        }
      } else if (activeSensorType === DEVICE_TYPES.RAIN) {
        let cumulative = 0;
        const processedRain = historyRecords.map((entry: WiseLatestRecord) => {
          const row: ChartRow = { time: entry.timestamp };
          const intervalRainFieldKey = `rainfall_${selectedRainInterval}`;
          let intervalRainMm: number | null = null;

          const direct = (entry as any)[intervalRainFieldKey];
          const fromRaw = entry.raw?.[intervalRainFieldKey];
          const rawLegacy10m = entry.raw?.rainfall_10m;

          if (direct !== undefined && direct !== null) intervalRainMm = parseFloat(direct);
          else if (fromRaw !== undefined && fromRaw !== null) intervalRainMm = parseFloat(String(fromRaw));
          else if (selectedRainInterval === '10m' && rawLegacy10m !== undefined && rawLegacy10m !== null) {
            intervalRainMm = parseFloat(String(rawLegacy10m));
          }

          row[intervalRainFieldKey] = intervalRainMm !== null && !isNaN(intervalRainMm) ? intervalRainMm : null;
          if (row[intervalRainFieldKey] !== null && !isNaN(row[intervalRainFieldKey])) {
            cumulative += row[intervalRainFieldKey];
          }
          row.accumulated_rainfall = cumulative;
          return row;
        }).filter(row => row.time && (row.accumulated_rainfall !== null || row[`rainfall_${selectedRainInterval}`] !== null));
        setData(processedRain);
      } else {
        const sensor = currentDevice.sensors?.[sensorIndex];
        if (!sensor || !sensor.channels || sensor.channels.length === 0) {
          console.warn('WISE: No sensor or channels found for index', sensorIndex, 'on device', currentDevice.id);
          setData([]); setLoading(false); return;
        }

        const processed = historyRecords.map((entry: WiseLatestRecord) => {
          const row: ChartRow = { time: entry.timestamp };
          let hasValidChannelData = false;

          if (entry.channels || entry.raw) {
            for (const ch of sensor.channels) {
              const chData = entry.channels?.[ch];
              const displayValueString = formatValue(currentDevice, sensor, chData, entry);
              let numericValue: number | null = null;

              if (typeof displayValueString === 'string' && displayValueString !== '無資料' && displayValueString !== 'N/A') {
                const match = displayValueString.match(/^(-?\d+(\.\d+)?)/);
                if (match && match[1]) numericValue = parseFloat(match[1]);
              }

              if (numericValue !== null && !isNaN(numericValue)) {
                row[ch] = numericValue;
                hasValidChannelData = true;
              } else {
                row[ch] = null;
              }
            }
          }
          return hasValidChannelData ? row : null;
        }).filter((row): row is ChartRow => row !== null && !!row.time);

        setData(processed);
      }
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
      setData([]); setFullHistoryData([]); setAvailableTimestamps([]); setSelectedTimestamp('');
    } finally {
      setLoading(false);
    }
  }, [deviceId, currentDevice, startDate, endDate, sensorIndex, selectedRainInterval, searchParams]);

  useEffect(() => { handleSearch(); }, [handleSearch]);

  useEffect(() => {
    if (currentDevice?.type === DEVICE_TYPES.TDR && selectedTimestamp && fullHistoryData.length > 0) {
      const selectedScan = fullHistoryData.find(scan => scan.timestamp === selectedTimestamp);
      const scanData = (selectedScan as any)?.data;
      if (selectedScan && Array.isArray(scanData)) {
        const chartData = scanData.map((point: any) => ({
          distance_m: typeof point.distance_m === 'number' ? point.distance_m : parseFloat(point.distance_m),
          rho: typeof point.rho === 'number' ? point.rho : parseFloat(point.rho),
        })).filter((p: any) => !isNaN(p.distance_m) && !isNaN(p.rho));
        setData(chartData);
      } else {
        setData([]);
        console.warn(`TrendPage: No TDR data found for ${deviceId} at timestamp ${selectedTimestamp}`);
      }
    }
  }, [selectedTimestamp, fullHistoryData, currentDevice, deviceId, loading]);

  const updateUrlParams = (newParams: Record<string, string | null | undefined>) => {
    const currentParams = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') currentParams.delete(key);
      else currentParams.set(key, String(value));
    });
    setSearchParams(currentParams, { replace: true });
  };

  const handleDeviceChange = (selectedDeviceId: string) => {
    setDeviceId(selectedDeviceId);
    setSensorIndex(0);
    setSelectedTimestamp('');
    updateUrlParams({ deviceId: selectedDeviceId, sensorIndex: '0', timestamp: null });
  };
  const handleSensorIndexChange = (newIndexStr: string) => {
    const newIndex = parseInt(newIndexStr, 10);
    setSensorIndex(newIndex);
    updateUrlParams({ sensorIndex: String(newIndex) });
  };
  const handleTimestampChange = (newTimestamp: string) => {
    setSelectedTimestamp(newTimestamp);
    updateUrlParams({ timestamp: newTimestamp });
  };
  const handleStartDateChange = (newDate: string) => {
    setStartDate(newDate); updateUrlParams({ startDate: newDate });
  };
  const handleEndDateChange = (newDate: string) => {
    setEndDate(newDate); updateUrlParams({ endDate: newDate });
  };
  const applyRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const newStart = fmt(start); const newEnd = fmt(end);
    setStartDate(newStart); setEndDate(newEnd);
    updateUrlParams({ startDate: newStart, endDate: newEnd });
  };

  const filterDeviceOptions = useMemo(() => {
    if (!routeGroup) return [];
    const options: { areaKey: string; areaName: string; devices: Device[] }[] = [];
    Object.entries(deviceMapping).forEach(([areaKey, areaConfig]) => {
      if (areaConfig.routeGroup === routeGroup) {
        options.push({ areaKey, areaName: areaConfig.name, devices: areaConfig.devices });
      }
    });
    return options;
  }, [routeGroup]);

  const yAxisDomain = useMemo<[number, number] | undefined>(() => {
    if (data.length === 0 || !currentDevice) return undefined;
    let values: number[] = [];
    if (currentDevice.sensors && currentDevice.sensors[sensorIndex]) {
      const channelsToExtract = currentDevice.sensors[sensorIndex].channels;
      values = data.flatMap(d => channelsToExtract.map((ch: string) => d[ch]).filter((v): v is number => typeof v === 'number'));
    }
    if (values.length === 0) return undefined;
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    if (dataMin === dataMax) return [dataMin - 1, dataMax + 1];

    const range = dataMax - dataMin;
    let padding = 0;
    if (currentDevice.type === DEVICE_TYPES.TI) padding = range * 0.3;
    else if (currentDevice.type === DEVICE_TYPES.GE) padding = range * 1;

    return [Math.floor(dataMin - padding), Math.ceil(dataMax + padding)];
  }, [data, currentDevice, sensorIndex]);

  const handleRainIntervalChange = (interval: string) => {
    setSelectedRainInterval(interval);
    updateUrlParams({ rainInterval: interval });
  };

  const chartSensorType = currentDevice?.sensors?.[sensorIndex]?.type || currentDevice?.type;

  const exportToCSV = () => {
    if (data.length === 0 || !currentDevice) return;
    setExportLoading(true);
    try {
      const headers: string[] = ['時間'];
      const dataRows: any[][] = [];

      if (chartSensorType === DEVICE_TYPES.RAIN) {
        headers.push(`區間雨量 (${selectedRainInterval})`, '累計雨量');
        data.forEach(row => {
          dataRows.push([formatDateTimeForCSV(row.time), row[`rainfall_${selectedRainInterval}`] ?? '', row.accumulated_rainfall ?? '']);
        });
      } else if (currentDevice.type !== DEVICE_TYPES.TDR) {
        const sensor = currentDevice.sensors?.[sensorIndex];
        if (sensor && sensor.channels) {
          sensor.channels.forEach(ch => {
            headers.push(`${ch} (原始值 mA)`);
            let displayUnit = '';
            if (sensor.type === DEVICE_TYPES.WATER) displayUnit = ' m';
            else if (sensor.type === DEVICE_TYPES.GE) displayUnit = ' mm';
            else if (sensor.type === DEVICE_TYPES.TI) displayUnit = ' "';
            else if (sensor.type === DEVICE_TYPES.BATTERY) displayUnit = ` ${sensor.unit || 'V'}`;
            headers.push(`${sensor.name} (展示值${displayUnit})`);
          });

          data.forEach(entry => {
            const rowValues: any[] = [formatDateTimeForCSV(entry.time)];
            const originalEntry = fullHistoryData.find(h => h.timestamp === entry.time);
            sensor.channels.forEach(ch => {
              let rawEgfValue: any = '';
              let displayValueString = '';
              if (originalEntry) {
                const chDataFromOriginal = originalEntry.channels?.[ch];
                const rawFromOriginal = originalEntry.raw;
                if (chDataFromOriginal && chDataFromOriginal.EgF !== undefined) rawEgfValue = chDataFromOriginal.EgF;
                else if (rawFromOriginal && rawFromOriginal[`${ch} EgF`] !== undefined) rawEgfValue = rawFromOriginal[`${ch} EgF`];
                rawEgfValue = (typeof rawEgfValue === 'number') ? rawEgfValue.toFixed(3) : (rawEgfValue || '');
                displayValueString = formatValue(currentDevice, sensor, chDataFromOriginal, originalEntry);
              }
              rowValues.push(rawEgfValue);
              let displayValue = 0;
              if (typeof displayValueString === 'string' && displayValueString !== '無資料' && displayValueString !== 'N/A') {
                const match = displayValueString.match(/^(-?\d+(\.\d+)?)/);
                if (match && match[1]) displayValue = parseFloat(match[1]);
              }
              rowValues.push(displayValue);
            });
            dataRows.push(rowValues);
          });
        }
      }

      const csvContent = [headers.join(','), ...dataRows.map(e => e.join(','))].join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = chartSensorType === DEVICE_TYPES.RAIN
        ? `${deviceId}_rainfall_${startDate}_${endDate}.csv`
        : `${currentDevice.name}-${currentDevice.sensors?.[sensorIndex]?.name || 'data'}_${deviceId}_${startDate}_${endDate}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) {
      console.error('匯出CSV錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportTdrCSV = () => {
    if (!currentDevice || currentDevice.type !== DEVICE_TYPES.TDR || !selectedTimestamp) return;
    const selectedScan = fullHistoryData.find(scan => scan.timestamp === selectedTimestamp);
    const scanData = (selectedScan as any)?.data;
    if (!selectedScan || !scanData) return;

    setExportLoading(true);
    try {
      const headers = ['distance_m', 'rho'];
      const rows = scanData.map((p: any) => [p.distance_m, p.rho]);
      const csvContent = [headers, ...rows].map((e: any[]) => e.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `tdr_curve_${deviceId}_${selectedTimestamp.replace(/[:T]/g, '-')}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) {
      console.error('匯出 TDR CSV 錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportToPNG = async () => {
    setExportLoading(true);
    try {
      const chartArea = document.getElementById('chart-container');
      if (!chartArea) return;
      const canvas = await html2canvas(chartArea);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `trend_${deviceId}_${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error('匯出PNG錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportTdrPNG = async () => {
    if (!currentDevice || currentDevice.type !== DEVICE_TYPES.TDR || !selectedTimestamp) return;
    setExportLoading(true);
    try {
      const chartArea = document.getElementById('tdr-chart-container');
      if (!chartArea) return;
      const canvas = await html2canvas(chartArea);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `tdr_curve_${deviceId}_${selectedTimestamp.replace(/[:T]/g, '-')}.png`;
      link.click();
    } catch (err) {
      console.error('匯出 TDR PNG 錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">趨勢圖查詢</h1>
        <p className="text-gray-600 mt-2">查詢監測設備的數據變化趨勢</p>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">快速時間範圍：</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyRange(1)} className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">最近一天</button>
          <button onClick={() => applyRange(7)} className="px-4 py-2 rounded-full text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1">最近一週</button>
          <button onClick={() => applyRange(30)} className="px-4 py-2 rounded-full text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1">最近一個月</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId} onChange={e => handleDeviceChange(e.target.value)}>
              <option value="">請選擇裝置</option>
              {filterDeviceOptions.map(({ areaKey, areaName, devices }) => (
                <optgroup key={areaKey} label={areaName}>
                  {devices.map(device => <option key={device.id} value={device.id}>{device.name} ({device.id})</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {deviceId && currentDevice && currentDevice.type !== DEVICE_TYPES.TDR && currentDevice.sensors && currentDevice.sensors.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通道組</label>
              <select value={sensorIndex} onChange={e => handleSensorIndexChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300">
                {currentDevice.sensors?.map((s, i) => <option key={i} value={i}>{s.name} ({DEVICE_TYPE_NAMES[s.type] || s.type})</option>)}
              </select>
            </div>
          )}

          {deviceId && currentDevice && chartSensorType === DEVICE_TYPES.RAIN && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">雨量區間</label>
              <select value={selectedRainInterval} onChange={e => handleRainIntervalChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300">
                <option value="10m">10分鐘</option><option value="1h">1小時</option>
                <option value="3h">3小時</option><option value="6h">6小時</option><option value="24h">24小時</option>
              </select>
            </div>
          )}

          {deviceId && currentDevice && currentDevice.type === DEVICE_TYPES.TDR && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇掃描時間點</label>
              <select value={selectedTimestamp} onChange={e => handleTimestampChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
                disabled={loading || availableTimestamps.length === 0}>
                {availableTimestamps.length === 0 && !loading && <option value="">無可用時間點</option>}
                {availableTimestamps.map(ts => (
                  <option key={ts} value={ts}>
                    {new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input type="date" className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={startDate} onChange={e => handleStartDateChange(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input type="date" className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={endDate} onChange={e => handleEndDateChange(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 bg-white rounded-xl shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : data.length > 0 && currentDevice ? (
        <div className="bg-white p-5 rounded-xl shadow-md">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">
              {currentDevice.name}-
              {chartSensorType === DEVICE_TYPES.TDR
                ? ` TDR 曲線 @ ${selectedTimestamp ? new Date(selectedTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '請選擇時間點'}`
                : chartSensorType === DEVICE_TYPES.RAIN
                  ? `${selectedRainInterval} 區間與累計雨量趨勢`
                  : currentDevice.sensors?.[sensorIndex]?.name}
            </h2>
            {chartSensorType !== DEVICE_TYPES.TDR && (
              <p className="text-sm text-gray-500">
                {new Date(startDate).toLocaleDateString('zh-TW')} ~ {new Date(endDate).toLocaleDateString('zh-TW')}
                <span className="ml-2">({(data || []).length} 筆資料)</span>
              </p>
            )}
          </div>

          <div id={chartSensorType === DEVICE_TYPES.TDR ? 'tdr-chart-container' : 'chart-container'}
            className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={chartSensorType === DEVICE_TYPES.TDR ? 'distance_m' : 'time'}
                  type={chartSensorType === DEVICE_TYPES.TDR ? 'number' : 'category'}
                  domain={chartSensorType === DEVICE_TYPES.TDR ? ['dataMin', 'dataMax'] : undefined}
                  tickFormatter={(tick: any) =>
                    chartSensorType === DEVICE_TYPES.TDR ? tick : format(new Date(tick), 'MM/dd HH:mm')}
                  label={chartSensorType === DEVICE_TYPES.TDR ? { value: '距離 (m)', position: 'insideBottomRight', offset: -5 } : undefined}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke={getChartLineColor(chartSensorType, true)}
                  label={{
                    value: chartSensorType === DEVICE_TYPES.RAIN ? `累計雨量 (基於${selectedRainInterval}, mm)`
                      : chartSensorType === DEVICE_TYPES.TDR ? '反射係數 (Rho)' : '數值',
                    angle: -90, position: 'insideLeft', fill: getChartLineColor(chartSensorType, true),
                    dy: chartSensorType === DEVICE_TYPES.RAIN ? 100 : 0,
                  }}
                  domain={currentDevice.sensors?.[sensorIndex]?.type === DEVICE_TYPES.RAIN ? [0, 'auto'] :
                    currentDevice.sensors?.[sensorIndex]?.type === DEVICE_TYPES.WATER ? [-55, 0] :
                      currentDevice.sensors?.[sensorIndex]?.type === DEVICE_TYPES.TI ? yAxisDomain :
                        currentDevice.sensors?.[sensorIndex]?.type === DEVICE_TYPES.GE ? yAxisDomain : undefined}
                />
                {chartSensorType === DEVICE_TYPES.RAIN && data.some(d => d[`rainfall_${selectedRainInterval}`] !== undefined && d[`rainfall_${selectedRainInterval}`] !== null) && (
                  <YAxis yAxisId="right" orientation="right"
                    stroke={getChartLineColor(DEVICE_TYPES.RAIN, false, true)}
                    label={{ value: `區間雨量 (${selectedRainInterval}, mm)`, angle: 90, position: 'insideRight', fill: getChartLineColor(DEVICE_TYPES.RAIN, false, true) }}
                    domain={[0, 'auto']} />
                )}
                <Tooltip
                  formatter={(value: any, name: any, props: any) => {
                    if (chartSensorType === DEVICE_TYPES.TDR) return [value, 'Rho'];
                    if (chartSensorType === DEVICE_TYPES.RAIN) {
                      if (props.dataKey === `rainfall_${selectedRainInterval}`) return [value + ' mm', `${selectedRainInterval}雨量`];
                      if (props.dataKey === 'accumulated_rainfall') return [value + ' mm', '累計雨量'];
                    }
                    if (chartSensorType === DEVICE_TYPES.WATER) return [value + ' m', '地下水位'];
                    if (chartSensorType === DEVICE_TYPES.TI) return [value + ' "', '傾斜量'];
                    if (chartSensorType === DEVICE_TYPES.GE) return [value + ' mm', '伸縮量'];
                    return [Number(value).toFixed(3), name];
                  }}
                  labelFormatter={(label: any) =>
                    chartSensorType === DEVICE_TYPES.TDR ? `距離: ${label} m`
                      : new Date(label).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                />
                <Legend />
                {chartSensorType === DEVICE_TYPES.TDR ? (
                  <Line yAxisId="left" key="rho" type="monotone" dataKey="rho" stroke={getChartLineColor(DEVICE_TYPES.TDR)} strokeWidth={2} dot={false} name="反射係數 (Rho)" isAnimationActive={false} />
                ) : chartSensorType === DEVICE_TYPES.RAIN ? (
                  <>
                    {data.some(d => d[`rainfall_${selectedRainInterval}`] !== undefined && d[`rainfall_${selectedRainInterval}`] !== null) && (
                      <Bar yAxisId="left" dataKey={`rainfall_${selectedRainInterval}`} fill={getChartLineColor(DEVICE_TYPES.RAIN, false, true)} name={`${selectedRainInterval}區間雨量`} barSize={10} />
                    )}
                    {data.some(d => Object.prototype.hasOwnProperty.call(d, 'accumulated_rainfall') && d.accumulated_rainfall !== null) && (
                      <Line yAxisId="left" type="monotone" dataKey="accumulated_rainfall" stroke={getChartLineColor(DEVICE_TYPES.RAIN, true)} strokeWidth={3} name={`累計雨量 (基於${selectedRainInterval})`} dot={false} isAnimationActive={false} />
                    )}
                  </>
                ) : (
                  currentDevice.sensors?.[sensorIndex]?.channels.map((ch: string, index: number) => (
                    <Line yAxisId="left" key={ch} type="monotone" dataKey={ch} stroke={getChartLineColor(chartSensorType, index > 0)} strokeWidth={1} dot={false} isAnimationActive={false}
                      name={(chartSensorType === DEVICE_TYPES.WATER) ? '地下水位' :
                        (chartSensorType === DEVICE_TYPES.TI) ? '傾斜量' :
                          (chartSensorType === DEVICE_TYPES.GE) ? '伸縮量' : ch} />
                  ))
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex justify-end space-x-2">
            {chartSensorType === DEVICE_TYPES.TDR ? (
              <>
                <button onClick={exportTdrCSV} disabled={exportLoading} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">{exportLoading ? '匯出中...' : '匯出 TDR CSV'}</button>
                <button onClick={exportTdrPNG} disabled={exportLoading} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">{exportLoading ? '匯出中...' : '匯出 TDR PNG'}</button>
              </>
            ) : (
              <>
                <button onClick={exportToCSV} disabled={exportLoading} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">{exportLoading ? '匯出中...' : '匯出 CSV'}</button>
                <button onClick={exportToPNG} disabled={exportLoading} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">{exportLoading ? '匯出中...' : '匯出 PNG'}</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-gray-500">
          {deviceId && currentDevice
            ? (chartSensorType === DEVICE_TYPES.TDR && availableTimestamps.length === 0 && !loading
              ? '此日期範圍內無 TDR 掃描資料'
              : '無資料可顯示，請調整查詢條件或選擇時間點')
            : '請先選擇裝置'}
        </p>
      )}
    </div>
  );
}

export default TrendPage;
