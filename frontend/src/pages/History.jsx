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
  const [searchTerm, setSearchTerm] = useState('');

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

  // 過濾裝置選項，用於顯示符合搜尋條件的裝置
  const filterDeviceOptions = () => {
    const allDeviceOptions = [];

    Object.entries(deviceMapping).forEach(([areaKey, area]) => {
      const filteredDevices = area.devices.filter(device => 
        !searchTerm || 
        device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (device.mac && device.mac.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      if (filteredDevices.length > 0) {
        allDeviceOptions.push({
          areaKey,
          areaName: area.name,
          devices: filteredDevices
        });
      }
    });

    return allDeviceOptions;
  };

  // 過濾表格資料，用於在不重新請求API的情況下過濾顯示資料
  const filterTableData = () => {
    if (!searchTerm) return data;

    return data.filter(entry => {
      const mac = entry.deviceId?.split('_')[1];
      let deviceConfig;
      let found = false;

      Object.values(deviceMapping).some(area => {
        deviceConfig = area.devices.find(device => device.mac === mac || device.id === entry.deviceId);
        if (deviceConfig) {
          found = deviceConfig.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (deviceConfig.mac && deviceConfig.mac.toLowerCase().includes(searchTerm.toLowerCase())) ||
                 (deviceConfig.id && deviceConfig.id.toLowerCase().includes(searchTerm.toLowerCase()));
          return true;
        }
        return false;
      });

      return found;
    });
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6 text-sm sm:text-xs">
      <h1 className="text-xl sm:text-2xl font-bold">歷史資料查詢</h1>

      {/* 搜尋欄位 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜尋裝置名稱..."
          value={searchTerm}
          onChange={handleSearch}
          className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="absolute right-3 top-2">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 快速選擇 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => applyRange(1)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一天</button>
        <button onClick={() => applyRange(7)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一週</button>
        <button onClick={() => applyRange(30)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一個月</button>
      </div>

      {/* 查詢條件 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="font-semibold">裝置</label>
          <select className="w-full border px-2 py-1 rounded text-sm" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            <option value="">全部裝置</option>
            {filterDeviceOptions().map(({areaKey, areaName, devices}) => (
              <optgroup key={areaKey} label={areaName}>
                {devices.map(device => (
                  <option key={device.mac || device.id} value={device.mac ? `WISE-4010LAN_${device.mac}` : device.id}>
                    {device.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="font-semibold">開始日期</label>
          <input
            type="date"
            className="w-full border px-2 py-1 rounded text-sm"
            value={startDate}
            onChange={e => {
              const val = e.target.value;
              setStartDate(val);
              syncDates(val, endDate, setStartDate, setEndDate);
            }}
          />
        </div>
        <div>
          <label className="font-semibold">結束日期</label>
          <input
            type="date"
            className="w-full border px-2 py-1 rounded text-sm"
            value={endDate}
            onChange={e => {
              const val = e.target.value;
              setEndDate(val);
              syncDates(startDate, val, setStartDate, setEndDate);
            }}
          />
        </div>
      </div>

      {/* 資料表格 */}
      <div className="overflow-x-auto">
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
            {filterTableData().map((entry, index) => {
              const mac = entry.deviceId?.split('_')[1];

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
      </div>

      {/* 分頁控制 */}
      <div className="flex justify-between mt-4">
        <button onClick={() => handlePageChange(-1)} disabled={offset === 0} className="px-3 py-1 sm:px-4 sm:py-2 bg-gray-300 rounded disabled:opacity-50 text-sm">
          上一頁
        </button>
        <button onClick={() => handlePageChange(1)} disabled={data.length < limit} className="px-3 py-1 sm:px-4 sm:py-2 bg-gray-300 rounded disabled:opacity-50 text-sm">
          下一頁
        </button>
      </div>
    </div>
  );
}

export default History;