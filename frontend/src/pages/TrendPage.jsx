import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES } from '../config/config';

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
  const [deviceId, setDeviceId] = useState('');
  const [sensorIndex, setSensorIndex] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [searchParams] = useSearchParams();
  const [currentDevice, setCurrentDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // 初始化日期和參數
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(weekAgo);
    setEndDate(today);

    // 從 URL 查詢參數中提取數據
    const deviceIdParam = searchParams.get('deviceId');
    const sensorIndexParam = searchParams.get('sensorIndex');
    
    if (deviceIdParam) {
      // 處理 deviceId
      setDeviceId(deviceIdParam);
      
      // 處理 sensorIndex
      if (sensorIndexParam) {
        const indexNum = parseInt(sensorIndexParam, 10);
        setSensorIndex(isNaN(indexNum) ? 0 : indexNum);
      }
      
      // 尋找當前裝置
      findCurrentDevice(deviceIdParam);
    }
  }, [searchParams]);

  // 找到裝置數據
  const findCurrentDevice = (id) => {
    let found = null;
    // 檢查是否直接匹配裝置 ID 或 mac
    Object.values(deviceMapping).some(area => {
      const device = area.devices.find(dev => {
        if (dev.mac && id === `WISE-4010LAN_${dev.mac}`) {
          return true;
        }
        if (dev.id && id === dev.id) {
          return true;
        }
        if (dev.mac && id === dev.mac) {
          return true;
        }
        return false;
      });
      
      if (device) {
        found = device;
        return true;
      }
      return false;
    });
    
    setCurrentDevice(found);
    return found;
  };

  // 當參數變更時取得資料
  useEffect(() => {
    if (deviceId && startDate && endDate && currentDevice) {
      handleSearch();
    }
  }, [deviceId, sensorIndex, startDate, endDate, currentDevice]);

  const handleSearch = async () => {
    if (!deviceId || !currentDevice) return;

    try {
      setLoading(true);
      // 確保正確的 deviceId 格式
      const actualDeviceId = currentDevice.mac 
        ? (deviceId.startsWith('WISE-4010LAN_') ? deviceId : `WISE-4010LAN_${currentDevice.mac}`) 
        : currentDevice.id;
        
      const sensor = currentDevice.sensors?.[sensorIndex];
      if (!sensor) {
        setLoading(false);
        return;
      }

      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId: actualDeviceId, startDate, endDate }
      });

      const raw = res.data;

      const processed = raw.map(entry => {
        const row = { time: entry.timestamp };
        for (const ch of sensor.channels) {
          const egf = entry.channels?.[ch]?.EgF;
          if (egf !== undefined) {
            const init = sensor.initialValues?.[ch] ?? 0;
            row[ch] = egf - init;
          }
        }
        return row;
      });

      setData(processed);
      setLoading(false);
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
      setLoading(false);
    }
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

  const applyRange = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const format = (d) => d.toISOString().split('T')[0];
    setStartDate(format(start));
    setEndDate(format(end));
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId}
              onChange={e => {
                setDeviceId(e.target.value);
                findCurrentDevice(e.target.value);
              }}
            >
              <option value="">請選擇裝置</option>
              {Object.entries(deviceMapping).map(([areaKey, area]) => (
                <optgroup key={areaKey} label={area.name}>
                  {area.devices.map(device => (
                    <option key={device.name} value={device.mac ? `WISE-4010LAN_${device.mac}` : device.id}>
                      {device.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {deviceId && currentDevice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通道組</label>
              <select 
                value={sensorIndex} 
                onChange={e => setSensorIndex(parseInt(e.target.value, 10))} 
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              >
                {currentDevice.sensors?.map((s, i) => (
                  <option key={i} value={i}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 圖表區塊 */}
      {loading ? (
        <div className="flex justify-center py-12 bg-white rounded-xl shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : data.length > 0 && currentDevice?.sensors?.[sensorIndex]?.channels ? (
        <div className="bg-white p-5 rounded-xl shadow-md">
          {/* 圖表標題 */}
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">
              {currentDevice.name} - {currentDevice.sensors[sensorIndex].name}
            </h2>
            <p className="text-sm text-gray-500">
              {new Date(startDate).toLocaleDateString('zh-TW')} ~ {new Date(endDate).toLocaleDateString('zh-TW')}
              <span className="ml-2">({data.length} 筆資料)</span>
            </p>
          </div>
          
          {/* 圖表容器 */}
          <div id="chart-container" className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={(tick) => new Date(tick).toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                />
                <YAxis />
                <Tooltip content={customTooltip} />
                <Legend />
                {currentDevice.sensors[sensorIndex].channels.map((ch, index) => (
                  <Line 
                    key={ch} 
                    type="monotone" 
                    dataKey={ch} 
                    stroke={getChannelColor(index)} 
                    dot={false} 
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 匯出按鈕 */}
          <div className="mt-4 flex justify-end space-x-2">
            <button 
              onClick={exportToCSV} 
              disabled={exportLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {exportLoading ? '匯出中...' : '匯出 CSV'}
            </button>
            <button 
              onClick={exportToPNG} 
              disabled={exportLoading}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              {exportLoading ? '匯出中...' : '匯出 PNG'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl shadow-md">
          <p className="text-gray-500">無資料可顯示</p>
        </div>
      )}
    </div>
  );
}

export default TrendPage;
