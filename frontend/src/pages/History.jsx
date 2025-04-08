import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping } from '../config/config';

function History() {
  const [data, setData] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => { 
    setStartDate(weekAgo);
    setEndDate(today);
  }, []);

  useEffect(() => {
    fetchData();
  }, [deviceId, startDate, endDate, offset]);

  const syncDates = (start, end, setStartDate, setEndDate) => {
    if (new Date(start) > new Date(end)) {
      setEndDate(start);
    }
  };

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/history`, {
        params: {
          deviceId: deviceId || undefined,
          startDate,
          endDate,
          limit,
          offset
        }
      });

      const sorted = res.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setData(sorted);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
    }
  };

  const handlePageChange = (direction) => {
    setOffset(prev => Math.max(0, prev + direction * limit));
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
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">歷史資料查詢</h1>

      <div className="flex gap-2 mb-4">
        <button onClick={() => applyRange(1)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一天</button>
        <button onClick={() => applyRange(7)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一週</button>
        <button onClick={() => applyRange(30)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一個月</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="font-semibold text-sm">裝置</label>
          <select className="w-full border p-2 rounded text-sm" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            <option value="">全部裝置</option>
            {Object.entries(deviceMapping).map(([areaKey, area]) => (
              <optgroup key={areaKey} label={area.name}>
                {area.devices.map(device => (
                  <option key={device.mac || device.id} value={device.mac ? `WISE-4010LAN_${device.mac}` : device.id}>
                    {device.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

        </div>
        <div>
          <label className="font-semibold text-sm">開始日期</label>
          <input type="date"
            className="w-full border p-2 rounded text-sm"
            value={startDate} 
            onChange={e => {
              const val = e.target.value;
              setStartDate(val);
              syncDates(val, endDate, setStartDate, setEndDate);
            }}
          />
        </div>
        <div>
          <label className="font-semibold text-sm">結束日期</label>
          <input
            type="date"
            className="w-full border p-2 rounded text-sm"
            value={endDate}
            onChange={e => {
              const val = e.target.value;
              setEndDate(val);
              syncDates(startDate, val, setStartDate, setEndDate);
            }}
          />
        </div>
      </div>

      <table className="w-full text-sm border mt-4">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">時間</th>
            <th className="p-2">站名</th>
            <th className="p-2">設備名稱</th>
            <th className="p-2">通道</th>
            <th className="p-2">原始值</th>
            <th className="p-2">變化量</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry, index) => {
            const mac = entry.deviceId?.split('_')[1];
            
            // 透過新結構找到對應device和sensor
            let deviceConfig;
            Object.values(deviceMapping).some(area => {
              deviceConfig = area.devices.find(device => device.mac === mac || device.id === entry.deviceId);
              return deviceConfig;
            });

            if (!deviceConfig) return null;

            return deviceConfig.sensors?.flatMap((sensor, sIdx) => {
              return sensor.channels.map(ch => {
                const chData = entry.channels?.[ch];
                if (!chData) return null;

                const egf = chData.EgF;
                const init = sensor.initialValues?.[ch] ?? 0;
                const delta = egf - init;

                return (
                  <tr key={`${index}-${ch}`} className="border-b">
                    <td className="p-2">
                      {new Date(entry.timestamp).toLocaleString('zh-TW', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </td>
                    <td className="p-2">{deviceConfig.name}</td>
                    <td className="p-2">{sensor.name}</td>
                    <td className="p-2">{ch}</td>
                    <td className="p-2 text-right">{egf?.toFixed(3)}</td>
                    <td className="p-2 text-right">{delta?.toFixed(3)}</td>
                  </tr>
                );
              });
            });
          })}
        </tbody>
      </table>

      <div className="flex justify-between mt-4">
        <button onClick={() => handlePageChange(-1)} disabled={offset === 0} className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50">
          上一頁
        </button>
        <button onClick={() => handlePageChange(1)} disabled={data.length < limit} className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50">
          下一頁
        </button>
      </div>
    </div>
  );
}

export default History;
