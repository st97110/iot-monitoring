import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES } from '../config/config';
import { Link } from 'react-router-dom';
import { getDeviceTypeColor, getDeviceTypeBorderColor, formatValue } from '../utils/sensor';

// 將 ISO 格式時間轉成相對時間字串（秒/分鐘/小時/天前）
function getRelativeTime(isoString) {
  const time = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

// ======== 設備站點照片路徑 ========
// 方式1：使用 public 資料夾中的圖片
const deviceImages = {
  // 根據設備ID或名稱對應照片路徑
  'TDR_T14_T1': '/stations/t1_tdr_site.jpg',
  'TDR_T14_T2': '/stations/t2_tdr_site.jpg',
  'TDR_T14_T3': '/stations/t3_tdr_site.jpg',
  'TDR_T14_T4': '/stations/t4_tdr_site.jpg',
  'TDR_T14_AH3': '/stations/ah3_tdr_site.jpg',
  'TDR_T14A_CH1': '/stations/ch1_tdr_site.jpg',
  'TDR_T14A_CH2': '/stations/ch2_tdr_site.jpg',
  // 'TDR_T14A_CH4': '/stations/ch4_tdr_site.jpg',

  // 'W2': '/stations/w2_water_site.jpg',
  'H2-R': '/stations/t4_rain_site.jpg',
  '14.25K-BT': '/stations/14.25k_ti_site.jpg',
  'CH-1-BT': '/stations/ch1_ti_site.jpg',
  'BE1': '/stations/ch2_be_site.jpg',
  'BE2': '/stations/ch3_be_site.jpg',
  // 'WISE-4010LAN_74FE48941AD9': '/stations/ch4_be_site.jpg',

  // 可以繼續添加更多站點...
};

// 方式2：使用設備類型的預設照片（當找不到特定站點照片時）
const defaultDeviceImages = {
  [DEVICE_TYPES.TI]: '/TI.png',
  [DEVICE_TYPES.WATER]: '/water.png', 
  [DEVICE_TYPES.RAIN]: '/RAIN.png',
  [DEVICE_TYPES.GE]: '/GE.png',
  [DEVICE_TYPES.TDR]: '/TDR.png',
};



// 根據設備資訊取得站點照片
function getDeviceImage(deviceConfig) { // 參數改為 deviceConfig 以更清晰
  // 1. 優先嘗試使用 deviceConfig.name 查找照片
  if (deviceConfig && deviceConfig.name && deviceImages[deviceConfig.name]) {
    return deviceImages[deviceConfig.name];
  }

  // 2. 如果用 name 找不到，再嘗試使用 deviceConfig.id 查找照片
  if (deviceConfig && deviceConfig.id && deviceImages[deviceConfig.id]) {
    return deviceImages[deviceConfig.id];
  }

  // 3. 如果都沒有特定照片，使用設備類型的預設照片
  //    注意：deviceConfig.type 來自於 deviceMapping
  const type = deviceConfig?.type; // 直接使用 deviceConfig.type
  if (type && defaultDeviceImages[type]) {
    return defaultDeviceImages[type];
  }

  // 4. 最後的兜底預設圖片
  return defaultDeviceImages['DEFAULT'];
}

// 根據資料更新時間判斷狀態顏色
function getStatusColor(timestamp) {
  const diffHours = (new Date() - new Date(timestamp)) / (1000 * 60 * 60);
  if (diffHours > 24) return 'text-red-500';
  if (diffHours > 6) return 'text-yellow-500';
  return 'text-green-500';
}

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

  // 取得所有區域名稱（第一個是「全部」）
  const allAreas = ['全部', ...Object.values(deviceMapping).map(a => a.name)];

  // 篩選：若使用者有選特定區域且輸入關鍵字
  function filterDevices(areaKey, area) {
    if (filterArea !== '全部' && area.name !== filterArea) return false;
    if (!searchTerm.trim()) return true;
    return area.devices.some(device =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }

  function filterDevice(device) {
    if (!searchTerm.trim()) return true;
    return device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  function isNormalData(device, chData) {
    if (device.type === DEVICE_TYPES.RAIN && chData?.rainfall_10m < 10) return true;          // 雨量筒小於 10 顯示為正常
    else if (device.type === DEVICE_TYPES.GE && Math.abs(chData?.Delta) < 50) return true;       // 伸縮計小於 30 顯示為正常
    else if (device.type === DEVICE_TYPES.TI && Math.abs(chData?.Delta) < 2 * 3600) return true; // 傾斜儀小於 5 度顯示為正常
    else if (device.type === DEVICE_TYPES.WATER && chData?.PEgF < -15) return true; // 水位計小於 -15 公尺顯示為正常
    return false;
  }

  

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
        
        {/* 頁面標題 */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">監測系統儀表板</h1>
          <p className="text-slate-600 mt-2">即時監控各區域設備狀態和數據</p>
        </div>

        {/* 區域選單 */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-md font-semibold text-slate-700 mb-3">選擇區域：</h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {allAreas.map(name => (
              <button
                key={name}
                onClick={() => setFilterArea(name === filterArea ? '全部' : name)}
                className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 whitespace-nowrap
                  ${ name === filterArea
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300 ring-offset-1' // 強調選中狀態
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                  }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* 載入中狀態 */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* 資料卡片區域 */}
        <div className="space-y-12">
          {Object.entries(deviceMapping)
            .filter(([areaKey, area]) => filterDevices(areaKey, area))
            .map(([areaKey, area]) => (
              // 區域標題美化
              <div key={areaKey} className="p-2">
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-800 relative inline-block">
                  {area.name}
                  <span className="absolute bottom-0 left-0 w-1/2 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full -mb-1"></span> {/* 強調線 */}
                </h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {area.devices
                    .filter(device => filterDevice(device))
                    .map(device => {
                      const deviceId = device.id;
                      const data = latestData[deviceId];

                      const hasValidTimestamp = data && data.timestamp && !isNaN(new Date(data.timestamp).getTime());
                      const hasTdrDataPoints = device.type === DEVICE_TYPES.TDR ? (data && Array.isArray(data.data) && data.data.length > 0) : true;

                      // ✨ 如果沒有數據、時間戳無效或 TDR data 為空
                      if (!data || !hasValidTimestamp || !hasTdrDataPoints ) { 
                        if (loading) return null;
                          return (
                            //「無數據」卡片樣式統一
                            <div key={deviceId} className={`flex flex-col justify-between border-2 ${getDeviceTypeBorderColor(device)} rounded-xl p-5 bg-white shadow-lg hover:shadow-xl transition-shadow`}>
                              <div>
                                <h3 className="text-lg font-semibold mb-2 text-slate-700">{device.name}</h3>
                                <p className="text-slate-500 text-xs mb-1">{DEVICE_TYPE_NAMES[device.type] || '設備'}</p>
                                <div className="text-slate-400 text-sm mt-4">
                                  {data && data.error ? `錯誤: ${data.error}` : '無即時數據'}
                                </div>
                              </div>
                              <div className="mt-4 flex justify-end">
                                <span className="text-sm text-slate-400 italic">請檢查設備或數據源</span>
                              </div>
                            </div>
                          );
                        }

                      // ======= 統一卡片樣式 =======
                      const cardColor = getDeviceTypeColor(device);
                      const borderColor = getDeviceTypeBorderColor(device);
                      const deviceIcon = getDeviceImage(device);
                      const statusClass = getStatusColor(data.timestamp);
                      const isRainGauge = device.type === DEVICE_TYPES.RAIN;

                      // 全部 sensor 整合到同一張卡片
                      return (
                        <div key={deviceId} className={`flex flex-col justify-between rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden bg-white border-l-4 ${borderColor}`}>
                          {/* 卡片頭部 - 顏色背景與儀器圖示 */}
                          <div className={`relative text-white p-4 flex items-start justify-between bg-gradient-to-br ${cardColor}`}>
                            <div className="flex-1 mr-4">
                              <h3 className="text-xl font-bold leading-tight break-words"> 
                                {device.name}
                              </h3>
                              <p className="text-white text-opacity-80 text-sm mt-1">
                                {DEVICE_TYPE_NAMES[device.type] || '設備'}
                              </p>
                            </div>
                            {/* 站點照片區域 */}
                            <div className="w-40 h-40 rounded-lg overflow-hidden shadow-md ml-auto shrink-0 bg-white bg-opacity-25 border-2 border-white">
                              <img 
                                src={deviceIcon}
                                alt={`${device.name} 站點照片`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // 如果圖片載入失敗，顯示預設圖片或emoji
                                  e.target.onerror = null;
                                  e.target.src = defaultDeviceImages['DEFAULT'];
                                }}
                              />
                            </div>
                          </div>

                          {/* 卡片內容 */}
                          <div className="p-4 flex flex-col flex-grow">
                            {/* 時間/狀態 */}
                            <div className="flex justify-between items-center mb-4 text-xs">
                              <span className="text-slate-500">
                                {new Date(data.timestamp).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`flex items-center font-medium ${statusClass}`}>
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusClass.replace('text-', 'bg-')} mr-1.5`}></span>
                                {getRelativeTime(data.timestamp)}
                              </span>
                            </div>
                            
                            {/* 主要數據區域 */}
                              <div className="flex-grow space-y-3"> {/* flex-grow 讓數據區填滿按鈕前的空間 */}
                                {isRainGauge && (
                                  <div className="text-center">
                                    <p className="text-xs text-slate-500 mb-1">最近10分鐘雨量</p>
                                    <p className="text-3xl font-bold text-blue-600">
                                      {data.rainfall_10m !== undefined && data.rainfall_10m !== null
                                        ? `${data.rainfall_10m.toFixed(1)}`
                                        : '-'}
                                      <span className="text-lg ml-1">mm</span>
                                    </p>
                                  </div>
                                )}

                                {!isRainGauge && device.type !== DEVICE_TYPES.TDR && (
                                  <div className="space-y-2">
                                    {device.sensors?.map((sensor, sIdx) => (
                                      <div key={sIdx} className="py-1">
                                        <p className="text-xs text-slate-500 mb-0.5">{sensor.name}</p>
                                        {(sensor.channels || []).map((ch) => {
                                          const chData = data.channels?.[ch];
                                          const displayValue = formatValue(device, chData, data);
                                          const normal = isNormalData(device, chData);
                                          return (
                                            <div key={ch} className="flex justify-between items-baseline">
                                              <span className={`text-lg font-semibold ${
                                                normal ? 'text-green-600' : 'text-red-600'
                                              }`}>
                                                {displayValue}
                                              </span>
                                            </div>
                                          );                                    
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                            {/* 卡片底部：查看趨勢 */}
                            <div className="mt-auto pt-4 flex justify-end">
                              <Link
                                to={`/trend?deviceId=${deviceId}${isRainGauge || (device.sensors && device.sensors.length > 0) ? '&sensorIndex=0' : ''}`}
                                className="text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-colors px-5 py-2.5 rounded-lg text-sm font-semibold shadow hover:shadow-md"
                              >
                                查看趨勢
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>

        {/* 若無符合結果 */}
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
      </div>
    </div>
  );
}

export default Home;