import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping } from '../config/config';
import { mAtoDepth } from '../utils/sensor';

function History() {
  const [data, setData] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

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
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/history`, {
        params: {
          deviceId: deviceId || undefined,
          // area: !deviceId ? '全部' : undefined,
          startDate,
          endDate,
          // limit,
          // offset
        }
      });

      const sorted = res.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setData(sorted);
      setLoading(false);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
      setLoading(false);
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

  const getStatusColor = (delta) => {
    if (!delta) return '';
    if (delta > 0.5) return 'text-red-600';
    if (delta < -0.5) return 'text-green-600';
    return 'text-gray-600';
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      {/* 頁面標題和描述 */}
      <div className="text-center py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">歷史資料查詢</h1>
        <p className="text-gray-600 mt-2">查詢各監測設備的歷史數據記錄</p>
      </div>

      {/* 搜尋欄位 - 改進的設計 */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜尋裝置名稱..."
          value={searchTerm}
          onChange={handleSearch}
          className="w-full border-2 border-blue-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300 shadow-sm transition-all duration-200"
        />
        <div className="absolute right-3 top-3">
          <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 快速選擇 - 美化設計 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">快速時間範圍：</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyRange(1)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一天</button>
          <button onClick={() => applyRange(7)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一週</button>
          <button onClick={() => applyRange(30)} className="px-4 py-2 rounded-full text-sm bg-white border border-blue-200 hover:bg-blue-50 transition-colors">最近一個月</button>
        </div>
      </div>

      {/* 查詢條件 - 美化設計 */}
      <div className="bg-white p-5 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">查詢條件</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select 
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300" 
              value={deviceId} 
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">全部裝置</option>
              {filterDeviceOptions().map(({areaKey, areaName, devices}) => (
                <optgroup key={areaKey} label={areaName}>
                  {devices.map(device => (
                    <option key={device.name} value={device.mac ? `WISE-4010LAN_${device.mac}` : device.id}>
                      {device.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={startDate}
              onChange={e => {
                const val = e.target.value;
                setStartDate(val);
                syncDates(val, endDate, setStartDate, setEndDate);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input
              type="date"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={endDate}
              onChange={e => {
                const val = e.target.value;
                setEndDate(val);
                syncDates(startDate, val, setStartDate, setEndDate);
              }}
            />
          </div>
        </div>
      </div>

      {/* 資料表格 - 美化設計 */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : filterTableData().length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">時間</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">站名</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">設備名稱</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">通道</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">原始值</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">變化量</th>
                </tr>
              </thead>
              <tbody>
                {filterTableData().map((entry, index) => {
                  let deviceConfig;
                  Object.values(deviceMapping).some(area => {
                    deviceConfig = area.devices.find(device => device.id === entry.deviceId);
                    return deviceConfig;
                  });
                  if (!deviceConfig) return null;
                  
                  return deviceConfig.sensors?.flatMap((sensor, sIdx) => {
                    return sensor.channels.map(ch => {
                      const chData = entry.channels?.[ch];
                      if (!chData) return null;
                      const egf = (chData.Cnt) ? Number(chData.Cnt) : Number(chData.EgF); // 雨量筒用Cnt
                      const init = sensor.initialValues?.[ch] ?? 0;
                      const delta = egf - init;

                      const isWater = sensor.type === DEVICE_TYPES.WATER;
                      const raw = egf;
                      const display = isWater
                        ? `${mAtoDepth(raw, sensor.wellDepth).toFixed(2)} m`
                        : raw?.toFixed(3);

                      return (
                        <tr key={`${index}-${ch}`} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            {new Date(entry.timestamp).toLocaleString('zh-TW', {
                              timeZone: 'Asia/Taipei',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </td>
                          <td className="px-4 py-3">{deviceConfig.name}</td>
                          <td className="px-4 py-3">{sensor.name}</td>
                          <td className="px-4 py-3">{ch}</td>
                          <td className="px-4 py-3 text-right font-medium">{display}</td>
                          <td className={`px-4 py-3 text-right font-medium ${getStatusColor(delta)}`}>
                            {delta?.toFixed(3)}
                          </td>
                        </tr>
                      );
                    });
                  });
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">無符合條件的資料</div>
              <button 
                onClick={() => {setSearchTerm(''); setDeviceId('');}}
                className="mt-3 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg"
              >
                重設篩選條件
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 分頁控制 - 美化設計 */}
      {!loading && filterTableData().length > 0 && (
        <div className="flex justify-between mt-4">
          <button 
            onClick={() => handlePageChange(-1)} 
            disabled={offset === 0} 
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:from-blue-600 hover:to-blue-700"
          >
            上一頁
          </button>
          <div className="px-4 py-2 bg-white border border-blue-200 rounded-lg text-blue-800">
            第 {Math.floor(offset / limit) + 1} 頁
          </div>
          <button 
            onClick={() => handlePageChange(1)} 
            disabled={data.length < limit} 
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:from-blue-600 hover:to-blue-700"
          >
            下一頁
          </button>
        </div>
      )}
      
      {/* 頁面底部 */}
      <div className="mt-8 py-4 border-t text-center text-sm text-gray-500">
        © {new Date().getFullYear()} 監測系統儀表板
      </div>
    </div>
  );
}

export default History;