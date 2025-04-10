import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES } from '../config/config';
import { Link } from 'react-router-dom';

function getRelativeTime(isoString) {
  const time = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

// 設備類型到顏色的映射
const typeColors = {
  [DEVICE_TYPES.TI]: 'from-blue-500 to-blue-600',
  [DEVICE_TYPES.WATER]: 'from-cyan-500 to-cyan-600',
  [DEVICE_TYPES.RAIN]: 'from-indigo-500 to-indigo-600',
  [DEVICE_TYPES.GE]: 'from-green-500 to-green-600',
  [DEVICE_TYPES.TDR]: 'from-purple-500 to-purple-600',
};

// 獲取設備類型顏色
const getDeviceTypeColor = (device) => {
  const type = device.sensors?.[0]?.type || device.type;
  return typeColors[type] || 'from-gray-500 to-gray-600';
};

// 獲取資料狀態顏色
const getStatusColor = (timestamp) => {
  const diffHours = (new Date() - new Date(timestamp)) / (1000 * 60 * 60);
  if (diffHours > 24) return 'text-red-500';
  if (diffHours > 6) return 'text-yellow-500';
  return 'text-green-500';
};

function Home() {
  const [latestData, setLatestData] = useState({});
  const [filterArea, setFilterArea] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/api/latest`)
      .then(res => {
        setLatestData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('取得最新資料失敗:', err);
        setLoading(false);
      });
  }, []);

  const allAreas = ['全部', ...Object.values(deviceMapping).map(a => a.name)];

  // 定義搜尋處理函數
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  // 過濾裝置的函數，同時考慮區域過濾和搜尋關鍵字
  const filterDevices = (areaKey, area) => {
    // 區域過濾
    if (filterArea !== '全部' && area.name !== filterArea) {
      return false;
    }

    // 如果沒有搜尋關鍵字，返回所有裝置
    if (!searchTerm.trim()) {
      return true;
    }

    // 檢查整個區域是否有任何裝置符合搜尋條件
    return area.devices.some(device => 
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.mac && device.mac.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  // 過濾單個裝置的函數
  const filterDevice = (device) => {
    if (!searchTerm.trim()) {
      return true;
    }
    return device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.mac && device.mac.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  return (
    <div className="max-w-screen-xl mx-auto px-2 sm:px-4 space-y-6">
      {/* 頁面標題和描述 */}
      <div className="text-center py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">監測系統儀表板</h1>
        <p className="text-gray-600 mt-2">即時監控各區域設備狀態和數據</p>
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

      {/* 區域選單 - 升級設計 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">選擇區域：</h3>
        <div className="flex flex-wrap gap-2">
          {allAreas.map(name => (
            <button
              key={name}
              onClick={() => setFilterArea(name === filterArea ? '全部' : name)}
              className={`px-4 py-2 rounded-full text-sm border transition-all duration-200 whitespace-nowrap ${
                name === filterArea 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-md' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* 載入狀態 */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* 資料區 */}
      <div className="space-y-10">
        {Object.entries(deviceMapping)
          .filter(([areaKey, area]) => filterDevices(areaKey, area))
          .map(([areaKey, area]) => (
          <div key={areaKey} className="bg-gradient-to-r from-gray-50 to-blue-50 p-5 rounded-xl shadow">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-800">{area.name}</span>
              <div className="ml-3 h-px flex-grow bg-gradient-to-r from-blue-200 to-transparent"></div>
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {area.devices
                .filter(device => filterDevice(device))
                .map(device => {
                const deviceId = device.mac ? `WISE-4010LAN_${device.mac}` : device.id;
                const data = latestData[deviceId];
                
                if (!data && !loading) return (
                  <div key={device.mac || device.id} className="border border-gray-200 rounded-xl p-5 bg-white shadow hover:shadow-md transition-shadow">
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">{device.name}</h3>
                    <div className="text-gray-400 text-sm">無可用數據</div>
                  </div>
                );

                if (!data) return null;

                return device.sensors?.map((sensor, idx) => {
                  const channels = sensor.channels.map(channel => {
                    const ch = data.channels?.[channel];
                    const egf = ch?.EgF ?? null;
                    const initial = sensor.initialValues?.[channel] ?? 0;
                    const delta = egf !== null ? (egf - initial).toFixed(3) : null;
                    return { channel, egf, delta };
                  });

                  const statusColor = getStatusColor(data.timestamp);
                  const gradientColor = getDeviceTypeColor(device);

                  return (
                    <div
                      key={(device.mac || device.id) + '-' + idx}
                      className="rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden"
                    >
                      {/* 卡片頭部 */}
                      <div className={`bg-gradient-to-r ${gradientColor} text-white p-4`}>
                        <h3 className="text-lg font-bold">{device.name}</h3>
                        <p className="text-white text-opacity-80 text-xs mt-1">
                          {DEVICE_TYPE_NAMES[sensor.type] || '設備'}
                        </p>
                      </div>
                      
                      {/* 卡片內容 */}
                      <div className="bg-white p-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs text-gray-500">
                            {new Date(data.timestamp).toLocaleString('zh-TW')}
                          </span>
                          <span className={`flex items-center ${statusColor}`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${statusColor.replace('text-', 'bg-')} mr-1`}></span>
                            {getRelativeTime(data.timestamp)}
                          </span>
                        </div>

                        <div className="border-t pt-3 mt-2">
                          <h4 className="font-semibold text-gray-700 mb-2">{sensor.name}</h4>
                          <div className="space-y-2">
                            {channels.map(({ channel, egf, delta }) => (
                              <div key={channel} className="flex justify-between items-center text-sm border-b pb-2">
                                <span className="text-gray-700 font-medium">{channel}</span>
                                <div className="flex flex-col items-end">
                                  <span className="font-semibold">
                                    {egf !== null ? egf.toFixed(3) : '無數據'}
                                  </span>
                                  {delta !== null && (
                                    <span className={`text-xs ${
                                      parseFloat(delta) > 0 
                                        ? 'text-red-500' 
                                        : parseFloat(delta) < 0 
                                        ? 'text-green-500' 
                                        : 'text-gray-500'
                                    }`}>
                                      變化: {delta}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                          <Link
                            to={`/trend?deviceId=${device.mac ? `WISE-4010LAN_${device.mac}` : device.id}&sensorIndex=${idx}`}
                            className="text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 transition-colors px-4 py-2 rounded-lg text-sm font-medium"
                          >
                            查看趨勢
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* 無結果顯示 */}
      {!loading && Object.entries(deviceMapping).filter(([areaKey, area]) => filterDevices(areaKey, area)).length === 0 && (
        <div className="text-center py-10">
          <div className="text-gray-400 text-lg">無符合條件的結果</div>
          <button 
            onClick={() => {setSearchTerm(''); setFilterArea('全部');}}
            className="mt-3 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg"
          >
            重設篩選條件
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

export default Home;