// TrendPage.jsx
import React, { useEffect, useState, useCallback } from 'react'; // ✨ 導入 useCallback
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES } from '../config/config';

// 獲取設備類型顏色
const getDeviceTypeColor = (type) => {
  const colors = {
    [DEVICE_TYPES.TI]: 'from-blue-500 to-blue-600',
    [DEVICE_TYPES.WATER]: 'from-cyan-500 to-cyan-600',
    [DEVICE_TYPES.RAIN]: 'from-indigo-500 to-indigo-600',
    [DEVICE_TYPES.GE]: 'from-green-500 to-green-600',
    [DEVICE_TYPES.TDR]: 'from-purple-500 to-purple-600',
  };
  return colors[type] || 'from-gray-500 to-gray-600';
};

// 獲取通道顏色
const getChannelColor = (index) => {
  const colors = ['#8884d8', '#82ca9d', '#ff7300', '#0088aa', '#ff5252', '#4caf50', '#9c27b0', '#ff9800'];
  return colors[index % colors.length];
};

function TrendPage() {
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
      setData([]);
      setFullHistoryData([]);
      setAvailableTimestamps([]);
      // setSelectedTimestamp(''); // 不在這裡清空，讓 URL 或預設邏輯處理
      setLoading(false);
      return;
    }

    setLoading(true);
    setData([]); // 清空舊圖表數據
    setFullHistoryData([]);
    setAvailableTimestamps([]);
    // 不重置 selectedTimestamp，讓它從 URL 讀取或後續邏輯設定

    try {
      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId: currentDevice.id, startDate, endDate, source: currentDevice.type?.toLowerCase() }
      });
      const historyRecords = res.data || [];

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
      } else { // WISE
        const sensor = currentDevice.sensors?.[sensorIndex];
        if (!sensor) {
          console.warn("WISE: No sensor found for index", sensorIndex, "on device", currentDevice.id);
          setLoading(false);
          return;
        }
        let processed = historyRecords.map(entry => {
          const row = { time: entry.timestamp };
          if (entry.channels || entry.raw) {
            for (const ch of sensor.channels) {
              const channelData = entry.channels?.[ch];
              let valueToProcess;
              if (channelData && channelData.EgF !== undefined) valueToProcess = channelData.EgF;
              else if (entry.raw && entry.raw[`${ch} EgF`] !== undefined) valueToProcess = entry.raw[`${ch} EgF`];
              else if (sensor.type === DEVICE_TYPES.RAIN && entry.raw && entry.raw[`${ch} Cnt`] !== undefined) valueToProcess = parseFloat(entry.raw[`${ch} Cnt`]) / 2;
              else if (sensor.type === DEVICE_TYPES.RAIN && entry[`rainfall_10m`] !== undefined) valueToProcess = entry[`rainfall_10m`];

              if (valueToProcess !== undefined) {
                const init = sensor.initialValues?.[ch] ?? 0;
                row[ch] = sensor.type === DEVICE_TYPES.RAIN ? parseFloat(valueToProcess) : (parseFloat(valueToProcess) - init);
              }
            }
          }
          return row;
        }).filter(row => row.time); // 過濾掉沒有時間戳的資料
        
        // ✨ 按時間升序排序，確保圖表 X 軸時間從左到右是從舊到新
        processed.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        
        setData(processed);
      }
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
      setData([]);
      setFullHistoryData([]);
      setAvailableTimestamps([]);
      setSelectedTimestamp('');
    } finally {
      setLoading(false);
    }
  }, [deviceId, currentDevice, startDate, endDate, sensorIndex, searchParams]); // ✨ searchParams 作為依賴，以響應 URL timestamp 變化

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
      <div className="text-center py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">趨勢圖查詢</h1>
        <p className="text-gray-600 mt-2">查詢監測設備的數據變化趨勢</p>
      </div>

      {/* 查詢區塊 */}
      <div className="bg-white p-5 rounded-xl shadow-md">
        {/* 快速選擇 */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">快速時間範圍：</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => applyRange(1)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一天</button>
            <button onClick={() => applyRange(7)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一週</button>
            <button onClick={() => applyRange(30)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一個月</button>
          </div>
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
              {Object.entries(deviceMapping).map(([areaKey, area]) => (
                <optgroup key={areaKey} label={area.name}>
                  {area.devices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 通道組 (WISE) 或 時間點選擇 (TDR) */}
          {deviceId && currentDevice && currentDevice.type !== DEVICE_TYPES.TDR && (
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
      ) : data.length > 0 && currentDevice? (
        <div className="bg-white p-5 rounded-xl shadow-md">
          {/* 圖表標題 */}
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">
              {currentDevice.name} -
              {currentDevice.type === DEVICE_TYPES.TDR
                ? ` TDR 曲線 @ ${selectedTimestamp ? new Date(selectedTimestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '請選擇時間點'}`
                : currentDevice.sensors?.[sensorIndex]?.name
              }
            </h2>
            {currentDevice.type !== DEVICE_TYPES.TDR && (
                 <p className="text-sm text-gray-500">
                    {new Date(startDate).toLocaleDateString('zh-TW')} ~ {new Date(endDate).toLocaleDateString('zh-TW')}
                    <span className="ml-2">({(data || []).length} 筆資料)</span>
                 </p>
            )}
          </div>
          
          {/* 圖表容器 - ✨ 給 TDR 圖表一個不同的 ID */}
          <div id={currentDevice.type === DEVICE_TYPES.TDR ? "tdr-chart-container" : "chart-container"} className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey={currentDevice.type === DEVICE_TYPES.TDR ? "distance_m" : "time"} // ✨ TDR 的 X 軸是 distance_m
                  type={currentDevice.type === DEVICE_TYPES.TDR ? "number" : "category"}   // ✨ TDR 的 X 軸是數值
                  domain={currentDevice.type === DEVICE_TYPES.TDR ? ['dataMin', 'dataMax'] : undefined} // ✨ TDR X 軸範圍
                  tickFormatter={(tick) => 
                    currentDevice.type === DEVICE_TYPES.TDR 
                      ? tick // TDR X 軸直接顯示距離數值
                      : new Date(tick).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit'})
                  }
                  label={currentDevice.type === DEVICE_TYPES.TDR ? { value: '距離 (m)', position: 'insideBottomRight', offset: 0 } : undefined}
                />
                <YAxis
                  label={currentDevice.type === DEVICE_TYPES.TDR ? { value: '反射係數 (Rho)', angle: -90, position: 'insideLeft' } : undefined}
                />
                <Tooltip
                  formatter={(value, name, props) =>
                     currentDevice.type === DEVICE_TYPES.TDR ? [Number(value).toFixed(4), 'Rho'] : [Number(value).toFixed(3), name]
                  }
                  labelFormatter={(label) =>
                    currentDevice.type === DEVICE_TYPES.TDR
                      ? `距離: ${label} m`
                      : new Date(label).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                  }
                />
                <Legend />
                {currentDevice.type === DEVICE_TYPES.TDR ? (
                  (data && data.length > 0) && // ✨ 確保 data 有數據才渲染 Line
                  <Line
                    key="rho"
                    type="monotone"
                    dataKey="rho"
                    stroke={getChannelColor(0)}
                    dot={false}
                    name="反射係數 (Rho)"
                  />
                ) : (
                  currentDevice.sensors?.[sensorIndex]?.channels.map((ch, index) => (
                    <Line
                      key={ch}
                      type="monotone"
                      dataKey={ch}
                      stroke={getChannelColor(index)}
                      dot={false}
                    />
                  ))
                )}
              </LineChart>
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