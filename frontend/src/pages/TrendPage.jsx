// TrendPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react'; // ✨ 導入 useCallback
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES } from '../config/config';
import { format, startOfHour } from 'date-fns';

// 獲取通道顏色
const getChartLineColor = (deviceType, isAccumulated = false) => {
  const typeBaseColors = {
    [DEVICE_TYPES.TI]: '#3B82F6', // blue-500
    [DEVICE_TYPES.WATER]: '#06B6D4', // cyan-500
    [DEVICE_TYPES.RAIN]: isAccumulated ? '#0EA5E9' : '#6366F1', // 累計用亮藍色，區間用靛藍
    [DEVICE_TYPES.GE]: '#22C55E', // green-500
    [DEVICE_TYPES.TDR]: '#8B5CF6', // purple-500
  };
  const defaultColor = '#6B7280'; // gray-500

  // 單通道或特定設備類型，使用基於設備類型的主色
  return typeBaseColors[deviceType] || defaultColor;
};

function TrendPage() {
  const { routeGroup } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // --- State Hooks ---
  const [deviceId, setDeviceId] = useState(searchParams.get('deviceId') || '');
  const [sensorIndex, setSensorIndex] = useState(parseInt(searchParams.get('sensorIndex') || '0', 10));
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || new Date().toISOString().split('T')[0]);
  
  const [currentDevice, setCurrentDevice] = useState(null);
  const [data, setData] = useState([]); // 用於圖表顯示的數據 (WISE: {time, ch1, ch2...}, TDR: {distance_m, rho})
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // ✨ TDR 相關狀態
  const [selectedTimestamp, setSelectedTimestamp] = useState(searchParams.get('timestamp') || ''); // 當前選中的 TDR 掃描時間戳
  const [availableTimestamps, setAvailableTimestamps] = useState([]); // TDR 可選的時間戳列表
  const [fullHistoryData, setFullHistoryData] = useState([]); // 儲存從 API 獲取的完整歷史數據 (包含所有時間點的掃描)

  // --- Helper Functions ---
  const findCurrentDevice = useCallback((idToFind) => {
    if (!idToFind) return null;
    for (const area of Object.values(deviceMapping)) {
      const device = area.devices.find(dev => dev.id === idToFind);
      if (device) return device;
    }
    console.warn(`TrendPage: Device ID "${idToFind}" not found in mapping.`);
    return null;
  }, []);

  // --- Effects ---

  // Effect to update currentDevice when deviceId (from URL or selection) changes
  useEffect(() => {
    setCurrentDevice(findCurrentDevice(deviceId));
    // ✨ 當 deviceId 改變時，如果是 TDR，可能需要重置 selectedTimestamp，除非 URL 中有
    if (findCurrentDevice(deviceId)?.type === DEVICE_TYPES.TDR) {
      const tsFromUrl = searchParams.get('timestamp');
      if (!tsFromUrl) setSelectedTimestamp(''); // 如果 URL 沒有 timestamp，則清空
    } else {
      // 如果不是 TDR，清空 TDR 相關 state
      setSelectedTimestamp('');
      setAvailableTimestamps([]);
      setFullHistoryData([]);
    }
  }, [deviceId, findCurrentDevice, searchParams]);

  // Effect to fetch data when relevant parameters change
  const handleSearch = useCallback(async () => {
    if (!deviceId || !currentDevice || !startDate || !endDate) {
      setData([]); setLoading(false); return;
    }

    setLoading(true);
    setData([]); // 清空舊圖表數據
    setFullHistoryData([]);
    setAvailableTimestamps([]);

    try {
      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId: currentDevice.id, startDate, endDate, source: currentDevice.type?.toLowerCase() }
      });
      const historyRecords = (res.data || []).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (currentDevice.type === DEVICE_TYPES.TDR) {
        setFullHistoryData(historyRecords);
        const timestamps = historyRecords
          .map(entry => entry.timestamp)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); //最新的在前面
        const uniqueTimestamps = [...new Set(timestamps)];
        setAvailableTimestamps(uniqueTimestamps);

        const timestampFromUrl = searchParams.get('timestamp');
        if (timestampFromUrl && uniqueTimestamps.includes(timestampFromUrl)) {
          setSelectedTimestamp(timestampFromUrl);
        } else if (uniqueTimestamps.length > 0) {
          setSelectedTimestamp(uniqueTimestamps[0]); // 預設選最新的
        } else {
          setSelectedTimestamp('');
        }
      } else if (currentDevice.type === DEVICE_TYPES.RAIN) {
        
        let baselineCount = null;
        if (historyRecords.length > 0 && historyRecords[0].raw && historyRecords[0].raw['DI_0 Cnt'] !== undefined) {
          baselineCount = parseFloat(historyRecords[0].raw['DI_0 Cnt']);
        }

        const processedRain = historyRecords.map(entry => {
          const row = { time: entry.timestamp };
          let currentCumulativeMm = null;
          let intervalRainMm = null;

          if (entry.raw && entry.raw['DI_0 Cnt'] !== undefined) {
            const currentCnt = parseFloat(entry.raw['DI_0 Cnt']);
            if (!isNaN(currentCnt) && baselineCount !== null) {
              // 計算相對於基線的累計雨量
              currentCumulativeMm = currentCnt >= baselineCount ? (currentCnt - baselineCount) / 2 : currentCnt / 2; // 處理計數器重置
            }
          }
          row.accumulated_rainfall = currentCumulativeMm;

          // 使用後端提供的 10 分鐘雨量 (或其他由 enrichRainfall 處理的區間雨量)
          if (entry.rainfall_10m !== undefined && entry.rainfall_10m !== null) {
            intervalRainMm = parseFloat(entry.rainfall_10m);
          } else if (entry.raw?.rain_10m !== undefined && entry.raw?.rain_10m !== null) { // Fallback
            intervalRainMm = parseFloat(entry.raw.rain_10m);
          }
          row.interval_rainfall = intervalRainMm; // 用於柱狀圖

          return row;
        }).filter(row => row.time && (row.accumulated_rainfall !== null || row.interval_rainfall !== null)); // 至少要有一種雨量數據
        setData(processedRain);

      } else { // 其他 WISE 設備 (例如 TI, WATER, GE)
        const sensor = currentDevice.sensors?.[sensorIndex];
        if (!sensor || !sensor.channels || sensor.channels.length === 0) { // ✨ 確保 sensor 和 channels 存在
          console.warn("WISE: No sensor or channels found for index", sensorIndex, "on device", currentDevice.id);
          setData([]); // ✨ 清空數據
          setLoading(false);
          return;
        }

        const processed = historyRecords.map(entry => {
          // ✨ 1. 為每個 entry 創建一個新的 row 對象，並首先放入 time
          const row = { time: entry.timestamp };
          let hasValidChannelData = false; // ✨ 標記此 entry 是否至少有一個有效的 channel 數據

          if (entry.channels || entry.raw) {
            for (const ch of sensor.channels) {
              const channelData = entry.channels?.[ch];
              let valueToProcess;

              // 從 channelData.EgF 或 entry.raw 中獲取原始值
              if (channelData && channelData.EgF !== undefined) {
                valueToProcess = channelData.EgF;
              } else if (entry.raw && entry.raw[`${ch} EgF`] !== undefined) {
                valueToProcess = entry.raw[`${ch} EgF`];
              }
              // 您可以為其他類型的原始值添加類似的 else if (例如電壓、電流等)

              if (valueToProcess !== undefined) {
                const parsedValue = parseFloat(valueToProcess);
                if (!isNaN(parsedValue)) { // ✨ 確保值可以被解析為數字
                    const init = sensor.initialValues?.[ch] ?? 0;
                    row[ch] = parsedValue - init; // ✨ 將計算後的值賦給 row[ch]
                    hasValidChannelData = true; // ✨ 標記有有效數據
                } else {
                    // console.warn(`WISE: Value for channel ${ch} is not a number:`, valueToProcess);
                    row[ch] = null; // 或者 undefined，確保圖表能處理
                }
              } else {
                row[ch] = null; // 如果找不到值，設為 null
              }
            }
          }
          // ✨ 2. 只有當這個 entry 處理後至少有一個 channel 的有效數據時，才返回 row
          //    或者，如果業務上允許只顯示部分 channel，可以調整此邏輯
          return hasValidChannelData ? row : null; // ✨ 如果沒有有效 channel 數據，返回 null
        })
        .filter(row => row && row.time); // ✨ 3. 過濾掉 null (沒有有效 channel 數據的) 和沒有時間戳的
        
        if (processed.length > 0) {
            setData(processed);
        } else {
            console.warn(`WISE: No processable data found for device ${currentDevice.id} and sensor ${sensor.name} after filtering.`);
            setData([]); // 如果處理後沒有數據，也清空
        }
      }
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
        setData([]); setFullHistoryData([]); setAvailableTimestamps([]); setSelectedTimestamp('');
    } finally {
      setLoading(false);
    }
  }, [deviceId, currentDevice, startDate, endDate, sensorIndex, searchParams]);

  // Trigger data fetch when critical parameters change
  useEffect(() => {
    handleSearch();
  }, [handleSearch]); // handleSearch 被 useCallback 包裹，其依賴變化時才會重新創建

  // Effect to update TDR chart data when selectedTimestamp or fullHistoryData changes
  useEffect(() => {
    if (currentDevice?.type === DEVICE_TYPES.TDR && selectedTimestamp && fullHistoryData.length > 0) {
      const selectedScan = fullHistoryData.find(scan => scan.timestamp === selectedTimestamp);
      if (selectedScan && Array.isArray(selectedScan.data)) {
        const chartData = selectedScan.data.map(point => ({
          distance_m: typeof point.distance_m === 'number' ? point.distance_m : parseFloat(point.distance_m),
          rho: typeof point.rho === 'number' ? point.rho : parseFloat(point.rho)
        })).filter(p => !isNaN(p.distance_m) && !isNaN(p.rho));
        setData(chartData);
      } else {
        setData([]);
        console.warn(`TrendPage: No TDR data found for ${deviceId} at timestamp ${selectedTimestamp}`);
      }
    } else if (currentDevice?.type !== DEVICE_TYPES.TDR && data.length === 0 && !loading && fullHistoryData.length > 0) {
      // This case might be redundant if WISE data is set directly in handleSearch
    }
  }, [selectedTimestamp, fullHistoryData, currentDevice, deviceId, loading]); // Added loading to prevent race conditions

  // --- Event Handlers to Update URL and State ---
  const updateUrlParams = (newParams) => {
    const currentParams = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        currentParams.delete(key);
      } else {
        currentParams.set(key, String(value));
      }
    });
    setSearchParams(currentParams, { replace: true });
  };

  const handleDeviceChange = (selectedDeviceId) => {
    setDeviceId(selectedDeviceId); // 這會觸發上面的 useEffect 來更新 currentDevice
    setSensorIndex(0); // 重置
    setSelectedTimestamp(''); // 重置
    // 更新 URL
    updateUrlParams({ deviceId: selectedDeviceId, sensorIndex: '0', timestamp: null });
  };

  const handleSensorIndexChange = (newIndexStr) => {
    const newIndex = parseInt(newIndexStr, 10);
    setSensorIndex(newIndex);
    updateUrlParams({ sensorIndex: newIndex });
  };

  const handleTimestampChange = (newTimestamp) => {
    setSelectedTimestamp(newTimestamp);
    updateUrlParams({ timestamp: newTimestamp });
  };

  const handleStartDateChange = (newDate) => {
    setStartDate(newDate);
    updateUrlParams({ startDate: newDate });
  };

  const handleEndDateChange = (newDate) => {
    setEndDate(newDate);
    updateUrlParams({ endDate: newDate });
  };

  const applyRange = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const format = (d) => d.toISOString().split('T')[0];
    const newStartDate = format(start);
    const newEndDate = format(end);
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    updateUrlParams({ startDate: newStartDate, endDate: newEndDate });
  };

  // 過濾裝置選項，用於顯示符合搜尋條件的裝置
  const filterDeviceOptions = useMemo(() => {
    if (!routeGroup) return [];

    const options = [];
    Object.entries(deviceMapping).forEach(([areaKey, areaConfig]) => {
      if (areaConfig.routeGroup === routeGroup) { // 只處理當前路線組的區域
        const filteredDevices = areaConfig.devices.filter(device =>
          device.name.toLowerCase() ||
          (device.id && device.id.toLowerCase())
        );
        if (filteredDevices.length > 0) {
          options.push({
            areaKey,
            areaName: areaConfig.name,
            devices: filteredDevices
          });
        }
      }
    });
    return options;
  }, [routeGroup]); // 依賴 routeGroup

  // 匯出 CSV
  const exportToCSV = () => {
    if (data.length === 0 || !currentDevice) return;
    
    setExportLoading(true);
    
    try {
      const headers = ['時間', ...currentDevice.sensors?.[sensorIndex]?.channels || []];
      const rows = data.map(row =>
        [row.time, ...headers.slice(1).map(ch => row[ch] ?? '')]
      );

      const csvContent = [headers, ...rows]
        .map(e => e.join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `trend_${deviceId}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('匯出CSV錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  // ✨ 匯出 CSV (TDR)
  const exportTdrCSV = () => {
    if (!currentDevice || currentDevice.type !== DEVICE_TYPES.TDR || !selectedTimestamp) return;
    const selectedScan = fullHistoryData.find(scan => scan.timestamp === selectedTimestamp);
    if (!selectedScan || !selectedScan.data) return;

    setExportLoading(true);
    try {
      const headers = ['distance_m', 'rho'];
      const rows = selectedScan.data.map(point => [point.distance_m, point.rho]);
      const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
      // ... (後續下載邏輯與原 exportToCSV 類似)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `tdr_curve_${deviceId}_${selectedTimestamp.replace(/[:T]/g, '-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('匯出 TDR CSV 錯誤:', err);
    } finally {
      setExportLoading(false);
    }
  };

  // 匯出 PNG 圖片
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

  // ✨ 匯出 PNG (TDR) - Chart container ID 可能需要確認
  const exportTdrPNG = async () => {
    if (!currentDevice || currentDevice.type !== DEVICE_TYPES.TDR || !selectedTimestamp) return;
    setExportLoading(true);
    try {
      const chartArea = document.getElementById('tdr-chart-container'); // ✨ 注意 ID
      if (!chartArea) return;
      const canvas = await html2canvas(chartArea);
      // ... (後續下載邏輯與原 exportToPNG 類似)
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

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
          <p className="text-gray-700 font-medium">{new Date(label).toLocaleString('zh-TW')}</p>
          <div className="mt-2">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center mb-1">
                <div className="w-3 h-3 mr-2" style={{ backgroundColor: entry.color }}></div>
                <span className="text-sm">
                  {entry.name}: <span className="font-medium">{entry.value?.toFixed(3)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      {/* 頁面標題和描述 */}
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">趨勢圖查詢</h1>
        <p className="text-gray-600 mt-2">查詢監測設備的數據變化趨勢</p>
      </div>

      {/* 查詢區塊 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        {/* 快速選擇 - 美化設計 */}
        <h3 className="text-sm font-semibold text-gray-600 mb-2">快速時間範圍：</h3>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => applyRange(1)} 
            className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            最近一天
          </button>
          <button 
            onClick={() => applyRange(7)} 
            className="px-4 py-2 rounded-full text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          >
            最近一週
          </button>
          <button 
              onClick={() => applyRange(30)} 
              className="px-4 py-2 rounded-full text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
          >
            最近一個月
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* 裝置選擇 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId}
              onChange={e => handleDeviceChange(e.target.value)}
            >
              <option value="">請選擇裝置</option>
              {filterDeviceOptions.map(({areaKey, areaName, devices}) => (
                <optgroup key={areaKey} label={areaName}>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.id}) {/* 顯示名稱和ID */}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 通道組 (WISE) 或 時間點選擇 (TDR) */}
          {deviceId && currentDevice && currentDevice.type !== DEVICE_TYPES.TDR && currentDevice.type !== DEVICE_TYPES.RAIN && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通道組</label>
              <select
                value={sensorIndex}
                onChange={e => handleSensorIndexChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              >
                {currentDevice.sensors?.map((s, i) => (
                  <option key={i} value={i}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {deviceId && currentDevice && currentDevice.type === DEVICE_TYPES.TDR && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇掃描時間點</label>
              <select
                value={selectedTimestamp}
                onChange={e => handleTimestampChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
                disabled={loading || availableTimestamps.length === 0}
              >
                {availableTimestamps.length === 0 && !loading && <option value="">無可用時間點</option>}
                {availableTimestamps.map(ts => (
                  <option key={ts} value={ts}>
                    {new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 開始日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={startDate}
              onChange={e => handleStartDateChange(e.target.value)}
            />
          </div>
          {/* 結束日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={endDate}
              onChange={e => handleEndDateChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 圖表區塊 */}
      {loading ? (
        <div className="flex justify-center py-12 bg-white rounded-xl shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : data.length > 0 && currentDevice ? (
        <div className="bg-white p-5 rounded-xl shadow-md">
          {/* 圖表標題 */}
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">
              {currentDevice.name} -
              {currentDevice.type === DEVICE_TYPES.TDR
                ? ` TDR 曲線 @ ${selectedTimestamp ? new Date(selectedTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '請選擇時間點'}`
                : currentDevice.type === DEVICE_TYPES.RAIN
                  ? '10分鐘雨量趨勢' // ✨ 雨量筒的圖表標題
                  : currentDevice.sensors?.[sensorIndex]?.name
              }
            </h2>
            {currentDevice.type !== DEVICE_TYPES.TDR && ( // TDR 的時間信息已在標題中
                 <p className="text-sm text-gray-500">
                    {new Date(startDate).toLocaleDateString('zh-TW')} ~ {new Date(endDate).toLocaleDateString('zh-TW')}
                    <span className="ml-2">({(data || []).length} 筆資料)</span>
                 </p>
            )}
          </div>
          
          {/* 圖表容器 - ✨ 給 TDR 圖表一個不同的 ID */}
          <div id={currentDevice.type === DEVICE_TYPES.TDR ? "tdr-chart-container" : "chart-container"} className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <ResponsiveContainer width="100%" height={currentDevice.type === DEVICE_TYPES.RAIN ? 500 : 400}>
              <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={currentDevice.type === DEVICE_TYPES.TDR ? "distance_m" : "time"} // ✨ TDR 的 X 軸是 distance_m
                  type={currentDevice.type === DEVICE_TYPES.TDR ? "number" : "category"}   // ✨ TDR 的 X 軸是數值
                  domain={currentDevice.type === DEVICE_TYPES.TDR ? ['dataMin', 'dataMax'] : undefined} // ✨ TDR X 軸範圍
                  tickFormatter={(tick) =>
                    currentDevice.type === DEVICE_TYPES.TDR
                      ? tick // TDR X 軸直接顯示距離數值
                      : format(new Date(tick), 'MM/dd HH:mm')
                  }
                  label={currentDevice.type === DEVICE_TYPES.TDR ? { value: '距離 (m)', position: 'insideBottomRight', offset: -5 } : undefined}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke={getChartLineColor(currentDevice.type, true)} // true for accumulated line
                  label={{
                    value:
                      currentDevice.type === DEVICE_TYPES.RAIN ? '累計雨量 (mm)' :
                      currentDevice.type === DEVICE_TYPES.TDR ? '反射係數 (Rho)' :
                      '數值', // 通用標籤
                    angle: -90, position: 'insideLeft', fill: getChartLineColor(currentDevice.type, true)
                  }}
                  domain={currentDevice.type === DEVICE_TYPES.RAIN ? [0, 'auto'] : undefined}
                />
                <Tooltip
                  formatter={(value, name) =>
                     currentDevice.type === DEVICE_TYPES.TDR ? [Number(value).toFixed(4), 'Rho'] :
                     currentDevice.type === DEVICE_TYPES.RAIN && name === 'rainfall' ? [Number(value).toFixed(1) + ' mm', '10分鐘雨量'] : // ✨ 雨量筒 Tooltip
                     [Number(value).toFixed(3), name]
                  }
                  labelFormatter={(label) =>
                    currentDevice.type === DEVICE_TYPES.TDR
                      ? `距離: ${label} m`
                      : new Date(label).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                  }
                />
                <Legend />
                {currentDevice.type === DEVICE_TYPES.TDR ? (
                  <Line yAxisId="left" key="rho" type="monotone" dataKey="rho" stroke={getChartLineColor(DEVICE_TYPES.TDR)} strokeWidth={2} dot={false} name="反射係數 (Rho)" isAnimationActive={false}/>
                ) : currentDevice.type === DEVICE_TYPES.RAIN ? (
                  <>
                    {data[0]?.hasOwnProperty('accumulated_rainfall') && (
                      <Line yAxisId="left" type="bump" dataKey="accumulated_rainfall" stroke={getChartLineColor(DEVICE_TYPES.RAIN, true)} strokeWidth={3} name="累計雨量" dot={false} isAnimationActive={false} />
                    )}
                    {data[0]?.hasOwnProperty('interval_rainfall') && (
                      <Bar yAxisId="left" dataKey="interval_rainfall" fill={getChartLineColor(DEVICE_TYPES.RAIN, false)} name="10分鐘雨量" barSize={10} />
                    )}
                  </>
                ) : (
                  // 其他 WISE 設備
                  currentDevice.sensors?.[sensorIndex]?.channels.map((ch, index) => (
                    <Line yAxisId="left" key={ch} type="monotone" dataKey={ch} stroke={getChartLineColor(currentDevice.type, index > 0)} strokeWidth={2} dot={false} name={ch} isAnimationActive={false}/>
                  ))
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 匯出按鈕 */}
          <div className="mt-4 flex justify-end space-x-2">
            {currentDevice.type === DEVICE_TYPES.TDR ? (
              <>
                <button onClick={exportTdrCSV} disabled={exportLoading} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                  {exportLoading ? '匯出中...' : '匯出 TDR CSV'}
                </button>
                <button onClick={exportTdrPNG} disabled={exportLoading} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                  {exportLoading ? '匯出中...' : '匯出 TDR PNG'}
                </button>
              </>
            ) : (
              <>
                <button onClick={exportToCSV} disabled={exportLoading} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                  {exportLoading ? '匯出中...' : '匯出 CSV'}
                </button>
                <button onClick={exportToPNG} disabled={exportLoading} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                  {exportLoading ? '匯出中...' : '匯出 PNG'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-gray-500">
          {deviceId && currentDevice ?
            (currentDevice.type === DEVICE_TYPES.TDR && availableTimestamps.length === 0 && !loading ?
            '此日期範圍內無 TDR 掃描資料' 
            : '無資料可顯示，請調整查詢條件或選擇時間點')
          : '請先選擇裝置'}
        </p>
      )}
    </div>
  );
}

export default TrendPage;