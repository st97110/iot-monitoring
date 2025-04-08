import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2canvas from 'html2canvas';
import { useSearchParams } from 'react-router-dom';
import { API_BASE, deviceMapping } from '../config/config';

function TrendPage() {
  const [mac, setMac] = useState('');
  const [sensorIndex, setSensorIndex] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const macParam = searchParams.get('mac');
    const sensorIndexParm = parseInt(searchParams.get('sensorIndex') || '0');
    if (macParam) {
      setMac(macParam);
      setSensorIndex(sensorIndexParm);
    }

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(weekAgo);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (mac && startDate && endDate) {
      handleSearch();
    }
  }, [mac, sensorIndex, startDate, endDate]);

  const allDevices = Object.values(deviceMapping).flatMap(area => area.devices);
  const currentDevice = allDevices.find(dev => dev.mac === mac || dev.id === mac);

  const handleSearch = async () => {
    if (!mac || !currentDevice) return;

    const deviceId = currentDevice.mac ? 'WISE-4010LAN_' + currentDevice.mac : currentDevice.id;
    const sensor = currentDevice.sensors?.[sensorIndex];
    if (!sensor) return;

    try {
      const res = await axios.get(`${API_BASE}/api/history`, {
        params: { deviceId, startDate, endDate }
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
    if (data.length === 0) return;

    const headers = ['時間', ...deviceMapping[mac]?.sensors?.[sensorIndex]?.channels || []];
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
    link.setAttribute('download', `trend_${mac}_${Date.now()}.csv`);
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
    link.download = `trend_${mac}_${Date.now()}.png`;
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

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => applyRange(1)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">最近一天</button>
        <button onClick={() => applyRange(7)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">最近一週</button>
        <button onClick={() => applyRange(30)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">最近一個月</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="font-semibold">裝置：</label>
          <select value={mac} onChange={e => setMac(e.target.value)} className="w-full border px-2 py-1 rounded">
            <option value="">請選擇</option>
            {allDevices.map(dev => (
              <option key={dev.mac || dev.id} value={dev.mac || dev.id}>{dev.name}</option>
            ))}
          </select>
        </div>

        {mac && currentDevice && (
          <div>
            <label className="font-semibold">通道組：</label>
            <select value={sensorIndex} onChange={e => setSensorIndex(parseInt(e.target.value))} className="w-full border px-2 py-1 rounded">
              {currentDevice.sensors?.map((s, i) => (
                <option key={i} value={i}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="font-semibold">開始日期：</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border px-2 py-1 rounded" />
        </div>
        <div>
          <label className="font-semibold">結束日期：</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border px-2 py-1 rounded" />
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
                  stroke={i === 0 ? '#8884d8' : '#82ca9d'}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {mac && (
        <div className="flex flex-wrap gap-2">
          <button onClick={exportToCSV} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">匯出 CSV</button>
          <button onClick={exportToPNG} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">下載圖表</button>
        </div>
      )}
    </div>
  );
}

export default TrendPage;