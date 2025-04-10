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
  const [offset, setOffset] = useState(0);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const deviceIdParam = searchParams.get('deviceId');
    const sensorIndexParam = parseInt(searchParams.get('sensorIndex') || '0');
    if (deviceIdParam) {
      setDeviceId(deviceIdParam);
      setSensorIndex(sensorIndexParam);
    }

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(weekAgo);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (deviceId && startDate && endDate) {
      handleSearch();
    }
  }, [deviceId, sensorIndex, startDate, endDate]);

  // 找到當前設備
  let currentDevice = null;
  Object.values(deviceMapping).some(area => {
    const device = area.devices.find(dev => dev.mac === deviceId || dev.id === deviceId);
    if (device) {
      currentDevice = device;
      return true;
    }
    return false;
  });

  const handleSearch = async () => {
    if (!deviceId || !currentDevice) return;

    const actualDeviceId = currentDevice.mac ? `WISE-4010LAN_${currentDevice.mac}` : currentDevice.id;
    const sensor = currentDevice.sensors?.[sensorIndex];
    if (!sensor) return;

    try {
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