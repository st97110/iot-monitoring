import React, { useEffect, useState, useMemo, use } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES, DEVICE_TYPE_NAMES } from '../config/config';
import { getDeviceTypeBorderColor, isNormalData, formatValue } from '../utils/sensor';

function History() {
  const { routeGroup } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
//  const [limit] = useState(10);
//  const [offset, setOffset] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { 
    setStartDate(today);
    setEndDate(today);
  }, []);

  // 根據 routeGroup 篩選出相關的設備 ID 列表
  const relevantDeviceIds = useMemo(() => {
    if (!routeGroup) return [];
    const ids = [];
    Object.values(deviceMapping).forEach(areaConfig => {
      if (areaConfig.routeGroup === routeGroup) {
        areaConfig.devices.forEach(device => ids.push(device.id));
      }
    });
    return ids;
  }, [routeGroup]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [deviceId, startDate, endDate, routeGroup]);

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

      let fetchedData = res.data || [];

      if (!deviceId && routeGroup) {
        fetchedData = fetchedData.filter(entry => relevantDeviceIds.includes(entry.deviceId));
      }

      const sorted = fetchedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setData(sorted);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // const handlePageChange = (direction) => {
  //   setOffset(prev => Math.max(0, prev + direction * limit));
  // };

  const applyRange = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const format = (d) => d.toISOString().split('T')[0];
    setStartDate(format(start));
    setEndDate(format(end));
    // setOffset(0); // 回到第一頁
  };

  // 過濾裝置選項，用於顯示符合搜尋條件的裝置
  const filterDeviceOptions = useMemo(() => {
    if (!routeGroup) return [];

    const options = [];
    Object.entries(deviceMapping).forEach(([areaKey, areaConfig]) => {
      if (areaConfig.routeGroup === routeGroup) { // 只處理當前路線組的區域
        const filteredDevices = areaConfig.devices.filter(device =>
          !searchTerm || // 如果沒有搜尋詞，則包含所有此區域的設備
          device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (device.id && device.id.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        if (filteredDevices.length > 0) {
          options.push({
            areaKey,
            areaName: areaConfig.name,
            devices: filteredDevices
          });
        }
      }
    });
    return options;
  }, [routeGroup, searchTerm]); // 依賴 routeGroup 和 searchTerm

  // 過濾表格資料，用於在不重新請求API的情況下過濾顯示資料
  const getFilteredTableData  = () => {
    let currentData = data;

    if (searchTerm && !deviceId) { // 只有在未選擇特定 deviceId 時，searchTerm 才用於進一步過濾列表
      // 如果有 searchTerm，則在當前 data 基礎上進行前端過濾
      currentData = data.filter(entry => {
        // 嘗試從 deviceMapping 中找到與 entry.deviceId 匹配的裝置配置
        let deviceConfig;
        Object.values(deviceMapping).some(area => {
          if (area.routeGroup === routeGroup) {
            deviceConfig = area.devices.find(d => d.id === entry.deviceId);
            if (deviceConfig) return true;
          }
          return false;
        });

        // 如果在 mapping 中找到了配置，則根據配置中的 name 和 id 進行搜尋
        if (deviceConfig) {
          return (
            deviceConfig.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (deviceConfig.id && deviceConfig.id.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        }
        // 如果 mapping 中沒有找到 (例如 TDR_T14_T3 這種直接用 ID 的)，則直接對 entry.deviceId 進行搜尋
        // 或者，如果 deviceId 是選中的，且 searchTerm 用於進一步過濾 (雖然通常 searchTerm 是用來選 deviceId 的)
        return entry.deviceId?.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }
    return currentData;
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const getStatusColor = (delta) => {
    if (delta === null || delta === undefined) return 'text-gray-400'; // 處理空值
    if (delta > 0.5) return 'text-red-600';
    if (delta < -0.5) return 'text-green-600';
    return 'text-gray-600';
  };

  return (
    <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            歷史資料查詢 - {routeGroup === 't14' ? '台14線及甲線' : routeGroup === 'T8' ? '台8線' : ''}
        </h1>
        <p className="text-gray-600 mt-2">查詢各監測設備的歷史數據記錄</p>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">快速時間範圍：</h3>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => applyRange(1)} 
            className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            最近一天
          </button>
          <button 
            onClick={() => applyRange(7)} 
            className="px-4 py-2 rounded-full text-sm font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          >
            最近一週
          </button>
          <button 
              onClick={() => applyRange(30)} 
              className="px-4 py-2 rounded-full text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
          >
            最近一個月
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">裝置</label>
            <select
              className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">全部裝置 ({routeGroup === 't14' ? '台14線及甲線' : '台8線'})</option>
              {filterDeviceOptions.map(({areaKey, areaName, devices}) => (
                <optgroup key={areaKey} label={areaName}>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.id}) {/* 顯示名稱和ID */}
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
          ) : getFilteredTableData ().length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">時間</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">站名</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">設備/感測器名稱</th>
                  {/* ✨ 修改欄位名 */}
                  <th className="px-4 py-3 font-semibold text-gray-700">類型/通道</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">數值 (原始值)</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredTableData().map((entry, index) => { // ✨ 使用 getFilteredTableData()
                  let deviceConfig;
                  Object.values(deviceMapping).some(areaConfig => {
                    if (areaConfig.routeGroup === routeGroup) {
                      const foundDevice = areaConfig.devices.find(d => d.id === entry.deviceId);
                      if (foundDevice) {
                        deviceConfig = foundDevice;
                        return true;
                      }
                    }
                    return false;
                  });

                  if (!deviceConfig || !entry.timestamp) return null;

                  const isTdrEntry = entry.source === 'tdr' || deviceConfig.type === DEVICE_TYPES.TDR;

                  // 獲取設備的主題顏色 (例如邊框顏色，但去掉 'border-' 前綴，並加上 'text-')
                  //    或者您可以為文字定義一組新的顏色映射
                  let stationNameColorClass = 'text-slate-700'; // 預設顏色
                  const borderColorClass = getDeviceTypeBorderColor(deviceConfig); // e.g., "border-blue-500"
                  if (borderColorClass.startsWith('border-')) {
                      stationNameColorClass = `text-${borderColorClass.substring('border-'.length)}`; // e.g., "text-blue-500"
                  }

                  if (isTdrEntry) {
                  // TDR 數據的新列佈局
                    return (
                      <tr key={`${index}-tdr-${entry.timestamp}`} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {new Date(entry.timestamp).toLocaleString('zh-TW', {
                            timeZone: 'Asia/Taipei',
                            year: 'numeric',
                            month: '2-digit', // 使用 2-digit 保持一致性
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                          })}
                        </td>
                        <td className={`px-4 py-3 font-medium ${stationNameColorClass}`}>{deviceConfig.name}</td> {/* 站名 */}
                        <td className="px-4 py-3">{deviceConfig.id} ({DEVICE_TYPE_NAMES[deviceConfig.type] || 'TDR'})</td> {/* 設備ID 和類型 */}
                        <td className="px-4 py-3 text-center">-</td> {/* 類型 (原始值) */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              // ✨ 使用 navigate 跳轉到 TrendPage
                              // 將 timestamp 進行 URL 編碼，以防特殊字符
                              navigate(`/trend?deviceId=${entry.deviceId}&timestamp=${encodeURIComponent(entry.timestamp)}`);
                            }}
                            className="text-blue-600 hover:text-blue-800 underline px-2 py-1 rounded hover:bg-blue-50"
                          >
                            查看曲線
                          </button>
                        </td>
                      </tr>
                    );
                  } else {
                    // WISE 或其他非 TDR 設備的顯示方式
                    return deviceConfig.sensors?.flatMap((sensor, sIdx) => {
                      return sensor.channels.map(ch => {
                        const chData = entry.channels?.[ch];
                        // WISE 雨量筒的特殊處理，如果後端已經處理好 rainfall_10m 或類似的，直接用
                        // 否則，可以嘗試從 raw 數據中獲取 'DI_x Cnt'
                        const isRain = sensor.type === DEVICE_TYPES.RAIN;
                        const displayValue = formatValue(deviceConfig, sensor, chData, entry);

                        let egfText = '-';
                        let deltaColor = 'text-gray-600';

                        if (deviceConfig.type !== DEVICE_TYPES.RAIN && chData) { // 雨量筒不顯示基於初始值的 delta
                          const egf = chData.EgF !== undefined ? Number(chData.EgF) : (entry.raw?.[`${ch} EgF`] !== undefined ? Number(entry.raw[`${ch} EgF`]) : undefined);
                          egfText = `${egf} mA`;
                        }

                        return (
                          <tr key={`${index}-${sIdx}-${ch}`} className="border-b hover:bg-gray-50 transition-colors">
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
                            <td className={`px-4 py-3 font-medium ${stationNameColorClass}`}>{deviceConfig.name}</td>
                            <td className="px-4 py-3">{sensor.name}</td>
                            <td className="px-4 py-3">{ch}</td> {/* 類型/通道 */}
                            <td className="px-4 py-3 text-right font-medium">
                              {displayValue}
                              {deviceConfig.type !== DEVICE_TYPES.RAIN && ( // 雨量筒不顯示括號里的變化量
                                <span className={`ml-2 ${deltaColor}`}>({egfText})</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    });
                  }
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">無符合條件的資料</div>
              <button
                onClick={() => { setSearchTerm(''); setDeviceId(''); setStartDate(today); setEndDate(today); }}
                className="mt-3 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg"
              >
                重設篩選條件
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 分頁控制 - 美化設計 */}
      {/* {!loading && filterTableData().length > 0 && (
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
      )} */}
      
      {/* 頁面底部 */}
      <div className="mt-8 py-4 border-t text-center text-sm text-gray-500">
        © {new Date().getFullYear()} 監測系統儀表板
      </div>
    </div>
  );
}

export default History;