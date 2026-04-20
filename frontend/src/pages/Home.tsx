import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES, Device, AreaConfig } from '../config/config';
import { Link, useParams } from 'react-router-dom';
import { getDeviceTypeColor, getDeviceTypeBorderColor, isNormalData, formatValue } from '../utils/sensor';
import type { LatestResponse } from '../types/api';

// 將 ISO 格式時間轉成相對時間字串
function getRelativeTime(isoString: string): string {
  const time = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - time.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

// ======== 設備站點照片路徑 ========
const deviceImages: Record<string, string> = {
  // --- 台14線 (t14) ---
  'TDR_T14_T1': '/images/stations/t14/TDR_T14_T1.jpg',
  'TDR_T14_T2': '/images/stations/t14/TDR_T14_T2.jpg',
  'TDR_T14_AH3': '/images/stations/t14/TDR_T14_AH3.jpg',
  'WISE-4010LAN_74FE489299CB': '/images/stations/t14/WISE_W2_WATER.jpg',
  'WISE-4060LAN_00D0C9FD4D44': '/images/stations/t14/WISE_H2R_RAIN.jpg',
  'TDR_T14_T3': '/images/stations/t14/TDR_T14_T3.jpg',
  'TDR_T14_T4': '/images/stations/t14/TDR_T14_T4.jpg',
  'WISE-4010LAN_00D0C9FAD2C9_SITE1': '/images/stations/t14/WISE_14_25K_BT_TI.jpg',
  'WISE-4010LAN_00D0C9FAD2C9_SITE2': '/images/stations/t14/WISE_14_27K_BT_TI.jpg',
  'SN_6721': '/images/stations/t14/CH1_BT_TI.jpg',
  'WISE-4010LAN_74FE489299F4': '/images/stations/t14/WISE_BE1_GE.jpg',
  'WISE-4010LAN_74FE4890BAFC': '/images/stations/t14/WISE_BE2_GE.jpg',
  'TDR_T14A_CH1': '/images/stations/t14/TDR_T14A_CH1.jpg',
  'TDR_T14A_CH2': '/images/stations/t14/TDR_T14A_CH2.jpg',

  // --- 台8線 (t8) ---
  'TDR_T8_T1': '/images/stations/t8/TDR_T8_T1.jpg',
  'TDR_T8_T2': '/images/stations/t8/TDR_T8_T2.jpg',
  'TDR_T8_T4': '/images/stations/t8/TDR_T8_T4.jpg',
  'TDR_T8_T7': '/images/stations/t8/TDR_T8_T7.jpg',
  'TDR_T8_T8': '/images/stations/t8/TDR_T8_T8.jpg',
  'TDR_T8_T9': '/images/stations/t8/TDR_T8_T9.jpg',
  'WISE-4010LAN_74FE4860F492': '/images/stations/t8/WISE_OW10_WATER.jpg',
  'WISE-4010LAN_00D0C9FAD2C2': '/images/stations/t8/WISE_GE3_GE.jpg',
  'WISE-4010LAN_74FE48595E19': '/images/stations/t8/WISE_BT1_BT3_TI.jpg',
  'SN_6955': '/images/stations/t8/WISE_BT1_BT3_TI.jpg',
  'WISE-4010LAN_74FE486CEDFB': '/images/stations/t8/WISE_OW6_WATER.jpg',
  'WISE-4010LAN_74FE486B76BB': '/images/stations/t8/WISE_BT2_TI.jpg',
  'WISE-4010LAN_74FE488F3BA0': '/images/stations/t8/WISE_OW5_WATER.jpg',
  'WISE-4060LAN_00D0C9E332E8': '/images/stations/t8/WISE_107K_RAIN.jpg',
  'WISE-4010LAN_74FE486B76AA': '/images/stations/t8/WISE_OW1_GE1_MULTI.jpg',
  'WISE-4010LAN_74FE487F4FE3': '/images/stations/t8/WISE_FL_FLOW.jpg',
};

export const defaultDeviceImages: Record<string, string> = {
  [DEVICE_TYPES.TI]: '/images/devices/TI.png',
  [DEVICE_TYPES.WATER]: '/images/devices/WATER.png',
  [DEVICE_TYPES.RAIN]: '/images/devices/RAIN.png',
  [DEVICE_TYPES.GE]: '/images/devices/GE.png',
  [DEVICE_TYPES.TDR]: '/images/devices/TDR.png',
  [DEVICE_TYPES.FLOW]: '/images/devices/FLOW.png',
  [DEVICE_TYPES.BATTERY]: '/images/devices/BATTERY.png',
  't8_DEFAULT': '/images/devices/t8_default_station.png',
  't14_DEFAULT': '/images/devices/t14_default_station.png',
  'DEFAULT': '/images/devices/default_station.png',
};

function getDeviceImage(deviceConfig: Device): string {
  if (!deviceConfig) return defaultDeviceImages['t8_DEFAULT'];
  if (deviceImages[deviceConfig.id]) return deviceImages[deviceConfig.id];
  const type = deviceConfig.type;
  if (type && defaultDeviceImages[type]) return defaultDeviceImages[type];
  return defaultDeviceImages['DEFAULT'];
}

function getStatusColor(timestamp: string): string {
  const diffHours = (new Date().getTime() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  if (diffHours > 24) return 'text-red-500';
  if (diffHours > 1) return 'text-yellow-500';
  return 'text-green-500';
}

function Home() {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const [latestData, setLatestData] = useState<LatestResponse>({});
  const [filterArea, setFilterArea] = useState<string>('全部');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    axios.get<LatestResponse>(`${API_BASE}/api/latest`)
      .then(res => { setLatestData(res.data); setLoading(false); })
      .catch(err => { console.error('取得最新資料失敗:', err); setLoading(false); });
  }, []);

  const relevantDeviceMappingEntries = useMemo<[string, AreaConfig][]>(() => {
    if (!routeGroup) return [];
    return Object.entries(deviceMapping).filter(([, areaConfig]) => areaConfig.routeGroup === routeGroup);
  }, [routeGroup]);

  const currentSiteAreas = useMemo<string[]>(() => {
    return ['全部', ...relevantDeviceMappingEntries.map(([, areaConfig]) => areaConfig.name)];
  }, [relevantDeviceMappingEntries]);

  function filterDevices(_areaKey: string, areaConfigFromMapping: AreaConfig): boolean {
    if (filterArea !== '全部' && areaConfigFromMapping.name !== filterArea) return false;
    if (!searchTerm.trim()) return true;
    return areaConfigFromMapping.devices.some(device =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.originalDeviceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       device.id?.toLowerCase().includes(searchTerm.toLowerCase())),
    );
  }

  function filterDevice(device: Device): boolean {
    if (!searchTerm.trim()) return true;
    return device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.originalDeviceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       device.id?.toLowerCase().includes(searchTerm.toLowerCase())) || false;
  }

  function getDeaultImage(): string {
    if (routeGroup === 't14') return defaultDeviceImages['t14_DEFAULT'];
    if (routeGroup === 't8') return defaultDeviceImages['t8_DEFAULT'];
    return defaultDeviceImages['DEFAULT'];
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            監測系統儀表板 - {routeGroup === 't14' ? '台14線及甲線' : routeGroup === 't8' ? '台8線' : '總覽'}
          </h1>
          <p className="text-slate-600 mt-2 text-md">即時監控各區域設備狀態和數據</p>
        </div>
        <hr className="border-slate-200" />

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-md font-semibold text-slate-700 mb-3">選擇區域：</h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {currentSiteAreas.map(name => (
              <button
                key={name}
                onClick={() => setFilterArea(name === filterArea ? '全部' : name)}
                className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 whitespace-nowrap
                  ${ name === filterArea
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300 ring-offset-1'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                  }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        )}

        <div className="space-y-12">
          {relevantDeviceMappingEntries
            .filter(([areaKey, areaConfig]) => filterDevices(areaKey, areaConfig))
            .map(([areaKey, areaConfig]) => (
              <div key={areaKey} className="p-2">
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-800 relative inline-block">
                  {areaConfig.name}
                  <span className="absolute bottom-0 left-0 w-1/2 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full -mb-1"></span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {areaConfig.devices
                    .filter(device => filterDevice(device))
                    .map((deviceConfigEntry: Device) => {
                      const deviceId = deviceConfigEntry.originalDeviceId || deviceConfigEntry.id;
                      const data = latestData[deviceId];

                      const hasValidTimestamp = !!(data?.timestamp && !isNaN(new Date(data.timestamp).getTime()));
                      const hasTdrDataPoints = deviceConfigEntry.type === DEVICE_TYPES.TDR
                        ? !!(data && Array.isArray((data as any).data) && (data as any).data.length > 0)
                        : true;

                      if (!data || !hasValidTimestamp || !hasTdrDataPoints) {
                        if (loading) return null;
                        return (
                          <div key={deviceId} className={`flex flex-col justify-between border-2 ${getDeviceTypeBorderColor(deviceConfigEntry)} rounded-xl p-5 bg-white shadow-lg hover:shadow-xl transition-shadow`}>
                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-slate-700">{deviceConfigEntry.name}</h3>
                              <p className="text-slate-500 text-xs mb-1">{(deviceConfigEntry.type && DEVICE_TYPE_NAMES[deviceConfigEntry.type]) || '設備'}</p>
                              <div className="text-slate-400 text-sm mt-4">
                                {data && (data as any).error ? `錯誤: ${(data as any).error}` : '無即時數據'}
                              </div>
                            </div>
                            <div className="mt-4 flex justify-end">
                              <span className="text-sm text-slate-400 italic">請檢查設備或數據源</span>
                            </div>
                          </div>
                        );
                      }

                      const cardColor = getDeviceTypeColor(deviceConfigEntry);
                      const borderColor = getDeviceTypeBorderColor(deviceConfigEntry);
                      const deviceIcon = getDeviceImage(deviceConfigEntry);
                      const statusClass = getStatusColor(data.timestamp!);
                      const isRainGauge = deviceConfigEntry.type === DEVICE_TYPES.RAIN;
                      const defalutImage = getDeaultImage();

                      return (
                        <div key={deviceId} className={`flex flex-col justify-between rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden bg-white border-l-4 ${borderColor}`}>
                          <div className={`relative text-white p-4 flex items-start justify-between bg-gradient-to-br ${cardColor}`}>
                            <div className="flex-1 mr-4">
                              <h3 className="text-xl font-bold leading-tight break-words">{deviceConfigEntry.name}</h3>
                              <p className="text-white text-opacity-80 text-sm mt-1">
                                {(deviceConfigEntry.type && DEVICE_TYPE_NAMES[deviceConfigEntry.type]) || '設備'}
                              </p>
                            </div>
                            <div className="w-40 h-40 rounded-lg overflow-hidden shadow-md ml-auto shrink-0 bg-white bg-opacity-25 border-2 border-white">
                              <img
                                src={deviceIcon}
                                alt={`${deviceConfigEntry.name} 站點照片`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (img.src !== defalutImage) {
                                    img.src = defalutImage;
                                  } else {
                                    img.style.display = 'none';
                                    console.error(`Failed to load default image: ${defalutImage}`);
                                  }
                                }}
                              />
                            </div>
                          </div>

                          <div className="p-4 flex flex-col flex-grow">
                            <div className="flex justify-between items-center mb-4 text-xs">
                              <span className="text-slate-500">
                                {new Date(data.timestamp!).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`flex items-center font-medium ${statusClass}`}>
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusClass.replace('text-', 'bg-')} mr-1.5`}></span>
                                {getRelativeTime(data.timestamp!)}
                              </span>
                            </div>

                            <div className="flex-grow space-y-3">
                              {isRainGauge && (
                                <div className="text-center space-y-1">
                                  {[
                                    { label: '1小時累積', key: 'rainfall_1h' },
                                    { label: '3小時累積', key: 'rainfall_3h' },
                                    { label: '24小時累積', key: 'rainfall_24h' },
                                  ].map(item => {
                                    const value = (data as any)[item.key] as number | undefined;
                                    const normal = isNormalData(deviceConfigEntry, undefined, value ?? null, item.key);
                                    const valueColor = normal ? 'text-blue-600' : 'text-red-500 font-bold';
                                    return (value !== undefined && value !== null) ? (
                                      <div key={item.key} className="py-0.5">
                                        <p className="text-xs text-slate-500">{item.label}</p>
                                        <p className={`text-xl font-bold ${valueColor}`}>
                                          {value.toFixed(1)}<span className="text-sm ml-1">mm</span>
                                        </p>
                                      </div>
                                    ) : null;
                                  })}
                                </div>
                              )}

                              {!isRainGauge && deviceConfigEntry.type !== DEVICE_TYPES.TDR && (
                                <div className="space-y-2">
                                  {deviceConfigEntry.sensors?.map((sensor, sIdx) => (
                                    <div key={sIdx} className="py-1">
                                      <p className="text-xs text-slate-500 mb-0.5">{sensor.name}</p>
                                      {(sensor.channels || []).map((ch: string) => {
                                        const chData = data.channels?.[ch];
                                        const displayValue = formatValue(deviceConfigEntry, sensor, chData, data);
                                        const normal = isNormalData(deviceConfigEntry, sensor, chData);
                                        return (
                                          <div key={ch} className="flex justify-between items-baseline">
                                            <span className={`text-lg font-semibold ${normal ? 'text-green-600' : 'text-red-600'}`}>
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

                            <div className="mt-auto pt-4 flex justify-end">
                              <Link
                                to={`/${routeGroup}/trend?deviceId=${deviceId}${isRainGauge || (deviceConfigEntry.sensors && deviceConfigEntry.sensors.length > 0) ? '&sensorIndex=0' : ''}`}
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

        {!loading && Object.entries(deviceMapping).filter(([areaKey, area]) => filterDevices(areaKey, area)).length === 0 && (
          <div className="text-center py-10">
            <div className="text-gray-400 text-lg">無符合條件的結果</div>
            <button
              onClick={() => { setSearchTerm(''); setFilterArea('全部'); }}
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
