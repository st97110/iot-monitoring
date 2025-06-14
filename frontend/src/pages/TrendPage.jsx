// TrendPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react'; // ✨ 導入 useCallback
import axios from 'axios';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES } from '../config/config';
import { format, startOfHour } from 'date-fns';
import { formatValue } from '../utils/sensor';

// 獲取通道顏色
const getChartLineColor = (deviceType, isAccumulated = false, isInterval = false) => {
  const typeBaseColors = {
    [DEVICE_TYPES.TI]: '#3B82F6', // blue-500
    [DEVICE_TYPES.WATER]: '#06B6D4', // cyan-500
    [DEVICE_TYPES.RAIN]: isAccumulated ? '#0EA5E9' : (isInterval ? '#6366F1' : '#4F46E5'), // 累計: 亮藍, 區間: 靛藍, 其他雨量相關: 深紫
    [DEVICE_TYPES.GE]: '#22C55E', // green-500
    [DEVICE_TYPES.TDR]: '#8B5CF6', // purple-500
  };
  const defaultColor = '#6B7280'; // gray-500

  // 單通道或特定設備類型，使用基於設備類型的主色
  return typeBaseColors[deviceType] || defaultColor;
};

const formatDateTimeForCSV = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      // 檢查日期是否有效
      if (isNaN(date.getTime())) {
        return isoString; // 如果無效，返回原始字串
      }
      // 'zh-TW' 代表台灣地區，會使用符合該地區的日期和時間格式 (通常是 YYYY/M/D 上/下午 H:MM:SS)
      // timeZone: 'Asia/Taipei' 明確指定轉換到台北時區
      // hour12: true 使用12小時制, hour12: false 使用24小時制
      return date.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: 'numeric', // 'numeric' (e.g., 6), '2-digit' (e.g., 06)
        day: 'numeric',   // 'numeric' (e.g., 2), '2-digit' (e.g., 02)
        hour: 'numeric',  // 'numeric' (e.g., 14 or 2), '2-digit' (e.g., 14 or 02)
        minute: '2-digit',
        second: '2-digit',
        hour12: false // ✨ 設定為 true 顯示為12小時制 (例如 下午 2:42:27)
                       // ✨ 設定為 false 顯示為24小時制 (例如 14:42:27)
      });
    } catch (e) {
      console.error("Error formatting date for CSV:", isoString, e);
      return isoString; // 出錯時返回原始字串
    }
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

  // 儲存從 API 獲取的完整歷史數據 (包含所有時間點的掃描)
  const [fullHistoryData, setFullHistoryData] = useState([]); 

  // 新增 state 用於選擇雨量區間
  const [selectedRainInterval, setSelectedRainInterval] = useState(searchParams.get('rainInterval') || '10m'); // 預設 10m

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
    }
  }, [deviceId, findCurrentDevice, searchParams]);

  // Effect to fetch data when relevant parameters change
  const handleSearch = useCallback(async () => {
    if (!deviceId || !currentDevice || !startDate || !endDate) {
      setData([]); setLoading(false); return;
    }

    setLoading(true);
    setData([]); setAvailableTimestamps([]); setFullHistoryData([]);

    try {
      const deviceIdForApi = currentDevice.originalDeviceId || currentDevice.id;

      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId: deviceIdForApi, startDate, endDate, source: currentDevice.type?.toLowerCase(), rainInterval: selectedRainInterval }
      });
      const historyRecords = (res.data || []).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setFullHistoryData(historyRecords);

      if (currentDevice.type === DEVICE_TYPES.TDR) {
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
        let cumulativeRainfallBasedOnSelectedInterval = 0; // 用於基於選擇的區間雨量來累加
        
        const processedRain = historyRecords.map(entry => {
          const row = { time: entry.timestamp };
          // const row = { time: new Date(entry.timestamp).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}) };
          // console.log("row", row);
          const intervalRainFieldKey = `rainfall_${selectedRainInterval}`;
          let intervalRainMm = null;

          if (entry[intervalRainFieldKey] !== undefined && entry[intervalRainFieldKey] !== null) {
            intervalRainMm = parseFloat(entry[intervalRainFieldKey]);
          } else if (entry.raw && entry.raw[intervalRainFieldKey] !== undefined && entry.raw[intervalRainFieldKey] !== null) { // Fallback to raw if backend structure varies
            intervalRainMm = parseFloat(entry.raw[intervalRainFieldKey]);
          } else if (selectedRainInterval === '10m' && entry.raw?.rainfall_10m !== undefined && entry.raw?.rainfall_10m !== null) { // Specific fallback for 10m
            intervalRainMm = parseFloat(entry.raw.rainfall_10m);
          }
          
          row[`rainfall_${selectedRainInterval}`] = !isNaN(intervalRainMm) ? intervalRainMm : null;

          // ✨ 基於選擇的 [`rainfall_${selectedRainInterval}`] 來計算累計雨量
          if (row[`rainfall_${selectedRainInterval}`] !== null && !isNaN(row[`rainfall_${selectedRainInterval}`])) {
            cumulativeRainfallBasedOnSelectedInterval += row[`rainfall_${selectedRainInterval}`];
          }
          row.accumulated_rainfall = cumulativeRainfallBasedOnSelectedInterval;

          return row;
        }).filter(row => row.time && (row.accumulated_rainfall !== null || row[`rainfall_${selectedRainInterval}`] !== null)); // 至少要有一種雨量數據
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
              const chData = entry.channels?.[ch];
              let displayValueString = formatValue(currentDevice, sensor, chData, entry);
              let numericValue = null;

              if (typeof displayValueString === 'string' && displayValueString !== '無資料' && displayValueString !== 'N/A') {
                // 嘗試從 "12.34 m" 中提取 12.34
                const match = displayValueString.match(/^(-?\d+(\.\d+)?)/);
                if (match && match[1]) {
                  numericValue = parseFloat(match[1]);
                }
              }
              
              if (numericValue !== null && !isNaN(numericValue)) {
                row[ch] = numericValue; // ✨ 存儲計算後的純數字展示值
                hasValidChannelData = true;
              } else {
                row[ch] = null; // 如果無法解析或無數據，設為 null
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
  }, [selectedTimestamp, fullHistoryData, currentDevice, deviceId, loading]);

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

  // 處理雨量區間選擇變更
  const handleRainIntervalChange = (interval) => {
    setSelectedRainInterval(interval);
    updateUrlParams({ rainInterval: interval });
  };

  // 匯出 CSV (WISE)
  const exportToCSV = () => {
    if (data.length === 0 || !currentDevice) return;
    setExportLoading(true);
    try {
      let headers = ['時間'];
      const dataRows = [];

      if (currentDevice.type === DEVICE_TYPES.RAIN) {
        // 雨量筒的 CSV 導出
        headers.push(`區間雨量 (${selectedRainInterval})`, '累計雨量'); // 假設 selectedRainInterval 和 accumulated_rainfall 存在
        data.forEach(row => {
          dataRows.push([
            formatDateTimeForCSV(row.time),
            row[`rainfall_${selectedRainInterval}`] ?? '', // 確保這些 key 在 data 中存在
            row.accumulated_rainfall ?? ''
          ]);
        });
      } else if (currentDevice.type !== DEVICE_TYPES.TDR) { // 其他 WISE 設備 (TI, WATER, GE)
        const sensor = currentDevice.sensors?.[sensorIndex];
        if (sensor && sensor.channels) {
          // 為每個通道創建兩個表頭：一個原始值(EgF)，一個展示值
          sensor.channels.forEach(ch => {
            headers.push(`${ch} (原始值 mA)`); // 例如 AI_0 (原始值 mA)
            // ✨ 獲取展示值的單位，用於表頭
            // 這裡需要一個方法從 sensor 配置或 deviceConfig 中獲取單位
            // 為了簡化，我們先用一個通用的 "展示值"
            // 您可以根據 sensor.type 或 chData 特性來決定更精確的單位名
            let displayUnit = '';
            if (currentDevice.type === DEVICE_TYPES.WATER) displayUnit = ' m';
            else if (currentDevice.type === DEVICE_TYPES.GE) displayUnit = ' mm';
            else if (currentDevice.type === DEVICE_TYPES.TI) displayUnit = ' "';
            // 其他類型可以不加單位或按需添加

            headers.push(`${sensor.name} (展示值${displayUnit})`); // 例如 AI_0 (展示值 m)
          });

          data.forEach(entry => { // entry 是圖表的一行數據，例如 { time: "...", AI_0: (delta值), AI_1: (delta值) }
            const rowValues = [formatDateTimeForCSV(entry.time)];
            // 要獲取原始 EgF，我們需要訪問後端返回的、未經處理的歷史數據
            // 我們需要 fullHistoryData (如果 WISE 也存了原始的 API response)

            // 假設 fullHistoryData 存有 API 原始返回的、包含 channels 和 raw 的數據
            const originalEntry = fullHistoryData.find(histEntry => histEntry.timestamp === entry.time);

            sensor.channels.forEach(ch => {
              let rawEgfValue = '';
              let displayValueString = '';

              if (originalEntry) {
                const chDataFromOriginal = originalEntry.channels?.[ch];
                const rawFromOriginal = originalEntry.raw;

                // 獲取原始 EgF
                if (chDataFromOriginal && chDataFromOriginal.EgF !== undefined) {
                    rawEgfValue = chDataFromOriginal.EgF;
                } else if (rawFromOriginal && rawFromOriginal[`${ch} EgF`] !== undefined) {
                    rawEgfValue = rawFromOriginal[`${ch} EgF`];
                }
                rawEgfValue = (typeof rawEgfValue === 'number') ? rawEgfValue.toFixed(3) : (rawEgfValue || '');


                // 獲取展示值 (需要傳入正確的 sensor 和 chData)
                // formatValue(deviceConfig, sensorConfig, channelSpecificData, fullEntryDataForTimestamp)
                displayValueString = formatValue(currentDevice, sensor, chDataFromOriginal, originalEntry);
                
              }
              rowValues.push(rawEgfValue);
              let displayValue = 0;
              if (typeof displayValueString === 'string' && displayValueString !== '無資料' && displayValueString !== 'N/A') {
                // 嘗試從 "12.34 m" 中提取 12.34
                const match = displayValueString.match(/^(-?\d+(\.\d+)?)/);
                if (match && match[1]) {
                  displayValue = parseFloat(match[1]);
                }
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
      const filename = currentDevice.type === DEVICE_TYPES.RAIN
        ? `${deviceId}_rainfall_${startDate}_${endDate}.csv`
        : `${currentDevice.name}-${currentDevice.sensors?.[sensorIndex]?.name || 'data'}_${deviceId}_${startDate}_${endDate}.csv`;
      link.setAttribute('download', filename);
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

          {/* ✨ 雨量區間選擇器 (僅對雨量筒顯示) */}
          {deviceId && currentDevice && currentDevice.type === DEVICE_TYPES.RAIN && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">雨量區間</label>
              <select
                value={selectedRainInterval}
                onChange={e => handleRainIntervalChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              >
                <option value="10m">10分鐘</option>
                <option value="1h">1小時</option>
                <option value="3h">3小時</option>
                <option value="6h">6小時</option>
                <option value="24h">24小時</option>
                {/* 您可以根據後端 enrichRainfall 支持的 duration 添加更多選項 */}
              </select>
            </div>
          )}

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
              {currentDevice.name}-
              {currentDevice.type === DEVICE_TYPES.TDR
                ? ` TDR 曲線 @ ${selectedTimestamp ? new Date(selectedTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '請選擇時間點'}`
                : currentDevice.type === DEVICE_TYPES.RAIN
                  ? `${selectedRainInterval} 區間與累計雨量趨勢` // ✨ 雨量筒的圖表標題
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
            <ResponsiveContainer width="100%" height={400}>
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
                      currentDevice.type === DEVICE_TYPES.RAIN ? `累計雨量 (基於${selectedRainInterval}, mm)` :
                      currentDevice.type === DEVICE_TYPES.TDR ? '反射係數 (Rho)' :
                      '數值', // 通用標籤
                    angle: -90, position: 'insideLeft', fill: getChartLineColor(currentDevice.type, true)
                  }}
                  domain={currentDevice.type === DEVICE_TYPES.RAIN ? [0, 'auto'] : 
                          currentDevice.type === DEVICE_TYPES.WATER ? [-55, 0] : 
                          currentDevice.type === DEVICE_TYPES.TI ? [-3600, 3600] : 
                          currentDevice.type === DEVICE_TYPES.GE ? [-500, 500] :
                          undefined}
                />
                {currentDevice.type === DEVICE_TYPES.RAIN && data.some(d => d[`rainfall_${selectedRainInterval}`] !== undefined && d[`rainfall_${selectedRainInterval}`] !== null) && (
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke={getChartLineColor(DEVICE_TYPES.RAIN, false, true)} // isInterval = true
                    label={{ value: `區間雨量 (${selectedRainInterval}, mm)`, angle: 90, position: 'insideRight', fill: getChartLineColor(DEVICE_TYPES.RAIN, false, true)}} 
                    domain={[0, 'auto']} // 區間雨量也從0開始，自動調整上限
                  />
                )}
                <Tooltip
                  formatter={(value, name, props) => {
                    if (currentDevice.type === DEVICE_TYPES.TDR) return [value, 'Rho'];
                    if (currentDevice.type === DEVICE_TYPES.RAIN) {
                      // ✨ Tooltip 的 name 應該匹配 Line/Bar 的 name 屬性
                      if (props.dataKey === `rainfall_${selectedRainInterval}`) return [value + ' mm', `${selectedRainInterval}雨量`];
                      if (props.dataKey === 'accumulated_rainfall') return [value + ' mm', `累計雨量`];
                    }
                    if (currentDevice.type === DEVICE_TYPES.WATER) return [value + ' m', '地下水位'];
                    if (currentDevice.type === DEVICE_TYPES.TI) return [value + ' "', '傾斜量'];
                    if (currentDevice.type === DEVICE_TYPES.GE) return [value + ' mm', '伸縮量'];
                    return [Number(value).toFixed(3), name];
                  }}
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
                    {data.some(d => d[`rainfall_${selectedRainInterval}`] !== undefined && d[`rainfall_${selectedRainInterval}`] !== null) && (
                      <Bar yAxisId="left" dataKey={`rainfall_${selectedRainInterval}`} fill={getChartLineColor(DEVICE_TYPES.RAIN, false, true)} name={`${selectedRainInterval}區間雨量`} barSize={10} />
                    )}
                    {data.some(d => d.hasOwnProperty('accumulated_rainfall') && d.accumulated_rainfall !== null) && (
                      <Line yAxisId="left" type="bump" dataKey="accumulated_rainfall" stroke={getChartLineColor(DEVICE_TYPES.RAIN, true)} strokeWidth={3} name={`累計雨量 (基於${selectedRainInterval})`} dot={false} isAnimationActive={false} />
                    )}
                  </>
                ) : (
                  // 其他 WISE 設備
                  currentDevice.sensors?.[sensorIndex]?.channels.map((ch, index) => (
                    <Line yAxisId="left" key={ch} type="monotone" dataKey={ch} stroke={getChartLineColor(currentDevice.type, index > 0)} strokeWidth={1} dot={false} isAnimationActive={false}
                    name={(currentDevice.type === DEVICE_TYPES.WATER) ? '地下水位' :
                    (currentDevice.type === DEVICE_TYPES.TI) ? '傾斜量' :
                    (currentDevice.type === DEVICE_TYPES.GE) ? '伸縮量' : ch} />
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