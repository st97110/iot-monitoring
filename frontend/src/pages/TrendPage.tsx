// TrendPage.tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Brush } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES, DEVICE_TYPE_NAMES, Device, Sensor } from '../config/config';
import { format } from 'date-fns';
import { formatValue } from '../utils/sensor';
import type { HistoryResponse, WiseLatestRecord } from '../types/api';
import PageContainer from '../components/PageContainer';
import PageHeader from '../components/PageHeader';
import RangeIcon from '../components/RangeIcon';
import { toTaipeiDateString, todayInTaipei } from '../utils/date';

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
  const [startDate, setStartDate] = useState<string>(searchParams.get('startDate') || todayInTaipei());
  const [endDate, setEndDate] = useState<string>(searchParams.get('endDate') || todayInTaipei());

  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [data, setData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  const [selectedTimestamp, setSelectedTimestamp] = useState<string>(searchParams.get('timestamp') || '');
  const [availableTimestamps, setAvailableTimestamps] = useState<string[]>([]);
  const [fullHistoryData, setFullHistoryData] = useState<HistoryResponse>([]);
  const [selectedRainInterval, setSelectedRainInterval] = useState<string>(searchParams.get('rainInterval') || '10m');

  // 疊圖比較用的其他裝置（逗號分隔存在 URL）
  const [compareDeviceIds, setCompareDeviceIds] = useState<string[]>(
    (searchParams.get('compare') || '').split(',').filter(Boolean),
  );
  // 疊圖模式時的統一調色盤（主裝置用 [0]、比較用 [1..]，避免跟 type 色撞色）
  const OVERLAY_PALETTE = ['#2563EB', '#DC2626', '#D97706', '#7C3AED', '#DB2777', '#0891B2'];

  // 依日期範圍動態決定 X 軸時間格式（範圍越大顯示越粗）
  const xAxisTimeFormat = useMemo<string>(() => {
    if (!startDate || !endDate) return 'MM/dd HH:mm';
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    if (days > 365) return 'yyyy/MM';
    if (days > 90)  return 'yyyy/MM/dd';
    if (days > 14)  return 'MM/dd';
    if (days > 2)   return 'MM/dd HH:mm';
    return 'HH:mm';
  }, [startDate, endDate]);

  // 依日期範圍自動選聚合窗口（降採樣減少回傳筆數，避免幾萬點 SVG 渲染卡）
  const autoAggregate = useMemo<string | undefined>(() => {
    if (!startDate || !endDate) return undefined;
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    if (days > 180) return '6h';   // 半年以上 → 每 6 小時平均
    if (days > 60)  return '1h';   // 兩個月以上 → 每小時
    if (days > 14)  return '30m';  // 兩週以上 → 每 30 分鐘
    if (days > 3)   return '15m';  // 三天以上 → 每 15 分鐘
    return undefined;              // 三天內 → 原始（10 分鐘級）
  }, [startDate, endDate]);

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
          // RAIN 與 TDR 不適用通用聚合（RAIN 已用 rainInterval 自己聚合）
          aggregate: activeSensorType !== DEVICE_TYPES.RAIN && activeSensorType !== DEVICE_TYPES.TDR ? autoAggregate : undefined,
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

        const toNumericValue = (dev: Device, s: Sensor, entry: WiseLatestRecord, ch: string): number | null => {
          const chData = entry.channels?.[ch];
          const displayValueString = formatValue(dev, s, chData, entry);
          if (typeof displayValueString !== 'string' || displayValueString === '無資料' || displayValueString === 'N/A') return null;
          const match = displayValueString.match(/^(-?\d+(\.\d+)?)/);
          return match && match[1] ? parseFloat(match[1]) : null;
        };

        const processed = historyRecords.map((entry: WiseLatestRecord) => {
          const row: ChartRow = { time: entry.timestamp };
          let hasValidChannelData = false;

          if (entry.channels || entry.raw) {
            for (const ch of sensor.channels) {
              const numericValue = toNumericValue(currentDevice, sensor, entry, ch);
              if (numericValue !== null) {
                row[ch] = numericValue;
                hasValidChannelData = true;
              } else {
                row[ch] = null;
              }
            }
          }
          return hasValidChannelData ? row : null;
        }).filter((row): row is ChartRow => row !== null && !!row.time);

        // ============ 疊圖：抓其他比較裝置的歷史，合併所有時間戳到同一條 x 軸 ============
        if (compareDeviceIds.length > 0) {
          const byTime: Record<string, ChartRow> = {};
          for (const row of processed) byTime[row.time] = row;

          await Promise.all(compareDeviceIds.map(async (cmpId) => {
            const cmpDevice = findCurrentDevice(cmpId);
            if (!cmpDevice) return;
            const cmpSensor = cmpDevice.sensors?.[0];
            if (!cmpSensor) return;
            try {
              const cmpRes = await axios.get<HistoryResponse>(`${API_BASE}/api/history`, {
                params: {
                  deviceId: cmpDevice.originalDeviceId || cmpDevice.id,
                  startDate, endDate,
                  aggregate: autoAggregate,
                },
              });
              (cmpRes.data || []).forEach((entry: WiseLatestRecord) => {
                if (!entry.timestamp) return;
                // 時間戳不存在就新增一列（可能該比較裝置上傳時間與主裝置不同步）
                if (!byTime[entry.timestamp]) {
                  byTime[entry.timestamp] = { time: entry.timestamp };
                }
                const row = byTime[entry.timestamp];
                for (const ch of cmpSensor.channels) {
                  const v = toNumericValue(cmpDevice, cmpSensor, entry, ch);
                  row[`${cmpId}__${ch}`] = v;
                }
              });
            } catch (e) {
              console.warn(`比較裝置 ${cmpId} 抓取失敗`, e);
            }
          }));

          // 按時間排序
          const merged = Object.values(byTime).sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
          );
          setData(merged);
        } else {
          setData(processed);
        }
      }
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
      setData([]); setFullHistoryData([]); setAvailableTimestamps([]); setSelectedTimestamp('');
    } finally {
      setLoading(false);
    }
  }, [deviceId, currentDevice, startDate, endDate, sensorIndex, selectedRainInterval, searchParams, compareDeviceIds, findCurrentDevice, autoAggregate]);

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
    const fmt = toTaipeiDateString;
    const newStart = fmt(start); const newEnd = fmt(end);
    setStartDate(newStart); setEndDate(newEnd);
    updateUrlParams({ startDate: newStart, endDate: newEnd });
  };

  const [deviceSearchTerm, setDeviceSearchTerm] = useState<string>('');

  const filterDeviceOptions = useMemo(() => {
    if (!routeGroup) return [];
    const kw = deviceSearchTerm.trim().toLowerCase();
    const options: { areaKey: string; areaName: string; devices: Device[] }[] = [];
    Object.entries(deviceMapping).forEach(([areaKey, areaConfig]) => {
      if (areaConfig.routeGroup !== routeGroup) return;
      const filtered = kw
        ? areaConfig.devices.filter(d => d.name.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw))
        : areaConfig.devices;
      if (filtered.length > 0) options.push({ areaKey, areaName: areaConfig.name, devices: filtered });
    });
    return options;
  }, [routeGroup, deviceSearchTerm]);

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

  // ============ 疊圖：可比較的裝置清單（相同 sensor.type，且不含自己或已選過的） ============
  const availableCompareDevices = useMemo<Device[]>(() => {
    if (!currentDevice || !routeGroup) return [];
    const primaryType = currentDevice.sensors?.[sensorIndex]?.type || currentDevice.type;
    if (!primaryType || primaryType === DEVICE_TYPES.TDR || primaryType === DEVICE_TYPES.RAIN) return [];
    const excluded = new Set([deviceId, ...compareDeviceIds]);
    return Object.values(deviceMapping)
      .filter(area => area.routeGroup === routeGroup)
      .flatMap(area => area.devices)
      .filter(d => !excluded.has(d.id) && (d.sensors?.[0]?.type === primaryType || d.type === primaryType));
  }, [currentDevice, sensorIndex, routeGroup, deviceId, compareDeviceIds]);

  const addCompareDevice = (id: string) => {
    if (!id || compareDeviceIds.includes(id)) return;
    const next = [...compareDeviceIds, id];
    setCompareDeviceIds(next);
    updateUrlParams({ compare: next.join(',') });
  };
  const removeCompareDevice = (id: string) => {
    const next = compareDeviceIds.filter(x => x !== id);
    setCompareDeviceIds(next);
    updateUrlParams({ compare: next.length ? next.join(',') : null });
  };

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
    <PageContainer>
      <PageHeader
        title={`趨勢圖查詢${routeGroup === 't14' ? ' · 台14線及甲線' : routeGroup === 't8' ? ' · 台8線' : ''}`}
        subtitle="查詢監測設備的數據變化趨勢"
      />

      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-slate-600">快速範圍：</span>
          <button onClick={() => applyRange(1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-blue-600 transition-colors">
            <RangeIcon days={1} className="w-4 h-4" /> 一天
          </button>
          <button onClick={() => applyRange(7)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-blue-600 transition-colors">
            <RangeIcon days={7} className="w-4 h-4" /> 一週
          </button>
          <button onClick={() => applyRange(30)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-blue-600 transition-colors">
            <RangeIcon days={30} className="w-4 h-4" /> 一個月
          </button>
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

        {/* 疊圖：只對非 TDR / 非 RAIN 的裝置開放 */}
        {deviceId && currentDevice && chartSensorType !== DEVICE_TYPES.TDR && chartSensorType !== DEVICE_TYPES.RAIN && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">疊圖比較（相同類型的其他站點）</label>
            <div className="flex flex-wrap items-center gap-2">
              {compareDeviceIds.map((cid, i) => {
                const cmp = findCurrentDevice(cid);
                if (!cmp) return null;
                return (
                  <span key={cid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white" style={{ backgroundColor: OVERLAY_PALETTE[(i + 1) % OVERLAY_PALETTE.length] }}>
                    {cmp.name}
                    <button onClick={() => removeCompareDevice(cid)} className="hover:bg-white/30 rounded-full w-4 h-4 flex items-center justify-center text-[10px]" title="移除">✕</button>
                  </span>
                );
              })}
              {availableCompareDevices.length > 0 && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) addCompareDevice(e.target.value); }}
                  className="border border-gray-300 px-2 py-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
                >
                  <option value="">＋ 加入比較裝置</option>
                  {availableCompareDevices.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                  ))}
                </select>
              )}
              {availableCompareDevices.length === 0 && compareDeviceIds.length === 0 && (
                <span className="text-xs text-gray-400">同區域無其他相同類型的裝置可比較</span>
              )}
            </div>
          </div>
        )}
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
                    chartSensorType === DEVICE_TYPES.TDR ? tick : format(new Date(tick), xAxisTimeFormat)}
                  minTickGap={80}                       /* 標籤至少間隔 80px，避免互疊 */
                  tick={{ fontSize: 11, fill: '#64748b' }}
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
                  <>
                    {/* 主裝置的線（疊圖模式時用統一調色盤 [0]；單裝置模式沿用 type 色） */}
                    {currentDevice.sensors?.[sensorIndex]?.channels.map((ch: string, index: number) => {
                      const primaryColor = compareDeviceIds.length > 0
                        ? OVERLAY_PALETTE[0]
                        : getChartLineColor(chartSensorType, index > 0);
                      // 多 channel 時第二、三條稍微透明區隔（不再用 dashed，dense 資料下虛線看起來像噪訊）
                      const opacity = index === 0 ? 1 : 0.7;
                      return (
                        <Line yAxisId="left" key={ch} type="monotone" dataKey={ch}
                          stroke={primaryColor} strokeOpacity={opacity}
                          strokeWidth={2}
                          strokeLinecap="round" strokeLinejoin="round"
                          dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                          isAnimationActive={false}
                          name={`${currentDevice.name} ${ch}`} connectNulls />
                      );
                    })}
                    {/* 疊圖：其他比較裝置的線（用調色盤 [1..]） */}
                    {compareDeviceIds.map((cid, i) => {
                      const cmp = findCurrentDevice(cid);
                      if (!cmp) return null;
                      const cmpSensor = cmp.sensors?.[0];
                      const color = OVERLAY_PALETTE[(i + 1) % OVERLAY_PALETTE.length];
                      return (cmpSensor?.channels || []).map((ch: string, chIdx: number) => (
                        <Line yAxisId="left" key={`${cid}__${ch}`} type="monotone" dataKey={`${cid}__${ch}`}
                          stroke={color} strokeOpacity={chIdx === 0 ? 0.95 : 0.65}
                          strokeWidth={1.75}
                          strokeLinecap="round" strokeLinejoin="round"
                          dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
                          isAnimationActive={false}
                          name={`${cmp.name} ${ch}`} connectNulls />
                      ));
                    })}
                  </>
                )}
                {/* 時間軸縮放（非 TDR 適用） */}
                {chartSensorType !== DEVICE_TYPES.TDR && data.length > 5 && (
                  <Brush dataKey="time" height={28} stroke="#6366F1" travellerWidth={10}
                    tickFormatter={(tick: any) => { try { return format(new Date(tick), xAxisTimeFormat); } catch { return ''; } }} />
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
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500">
            {deviceId && currentDevice
              ? (chartSensorType === DEVICE_TYPES.TDR && availableTimestamps.length === 0 && !loading
                ? '此日期範圍內無 TDR 掃描資料'
                : '無資料可顯示，請調整查詢條件或選擇時間點')
              : '請先選擇裝置'}
          </p>
        </div>
      )}
    </PageContainer>
  );
}

export default TrendPage;
