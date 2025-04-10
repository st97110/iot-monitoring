import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams } from 'react-router-dom';
import { API_BASE, deviceMapping } from '../config/config';

function TrendPage() {
  const [deviceId, setDeviceId] = useState('');
  const [sensorIndex, setSensorIndex] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [searchParams] = useSearchParams();
  const [currentDevice, setCurrentDevice] = useState(null);

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
    if (deviceId && startDate && endDate) {
      handleSearch();
    }
  }, [deviceId, sensorIndex, startDate, endDate, currentDevice]);

  const handleSearch = async () => {
    if (!deviceId || !currentDevice) return;

    try {
      // 確保正確的 deviceId 格式
      const actualDeviceId = currentDevice.mac ? 
        (deviceId.startsWith('WISE-4010LAN_') ? deviceId : `WISE-4010LAN_${currentDevice.mac}`) : 
        currentDevice.id;
        
      const sensor = currentDevice.sensors?.[sensorIndex];
      if (!sensor) return;

      console.log('查詢資料：', actualDeviceId, startDate, endDate);

      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId: actualDeviceId, startDate, endDate }
      });

      const raw = res.data;
      console.log('獲取資料筆數:', raw.length);

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
    } catch (err) {
      console.error('取得趨勢資料錯誤:', err);
    }
  };

  // 匯出 CSV
  const exportToCSV = () => {
    if (data.length === 0 || !currentDevice) return;

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
  };

  // 匯出 PNG 圖片
  const exportToPNG = async () => {
    const chartArea = document.getElementById('chart-container');
    if (!chartArea) return;

    const canvas = await html2canvas(chartArea);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `trend_${deviceId}_${Date.now()}.png`;
    link.click();
  };

  const applyRange = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const format = (d) => d.toISOString().split('T')[0];
    setStartDate(format(start));
    setEndDate(format(end));
    setOffset(0); // 回到第一頁
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6 text-sm sm:text-xs">
      <h1 className="text-xl sm:text-2xl font-bold">趨勢圖查詢</h1>

      {/* 快速選擇 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => applyRange(1)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一天</button>
        <button onClick={() => applyRange(7)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一週</button>
        <button onClick={() => applyRange(30)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一個月</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="font-semibold">裝置</label>
          <select className="w-full border px-2 py-1 rounded text-sm" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            <option value="">請選擇裝置</option>
            {Object.entries(deviceMapping).map(([areaKey, area]) => (
              <optgroup key={areaKey} label={area.name}>
                {area.devices.map(device => (
                  <option key={device.mac || device.id} value={device.mac || device.id}>
                    {device.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {deviceId && currentDevice && (
          <div>
            <label className="font-semibold">通道組</label>
            <select 
              value={sensorIndex} 
              onChange={e => setSensorIndex(parseInt(e.target.value))} 
              className="w-full border px-2 py-1 rounded text-sm"
            >
              {currentDevice.sensors?.map((s, i) => (
                <option key={i} value={i}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="font-semibold">開始日期</label>
          <input
            type="date"
            className="w-full border px-2 py-1 rounded text-sm"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="font-semibold">結束日期</label>
          <input
            type="date"
            className="w-full border px-2 py-1 rounded text-sm"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {data.length > 0 && currentDevice?.sensors?.[sensorIndex]?.channels && (
        <div id="chart-container">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <XAxis
                dataKey="time"
                tickFormatter={(val) =>
                  new Date(val).toLocaleString('zh-TW', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                }
              />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              {currentDevice.sensors[sensorIndex].channels.map((ch, i) => (
                <Line
                  key={ch}
                  dataKey={ch}
                  type="monotone"
                  stroke={['#8884d8', '#82ca9d', '#ff7300', '#0088aa'][i % 4]}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {deviceId && (
        <div className="flex flex-wrap gap-2">
          <button onClick={exportToCSV} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">匯出 CSV</button>
          <button onClick={exportToPNG} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">下載圖表</button>
        </div>
      )}
    </div>
  );
}

export default TrendPage;