import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPES } from '../config/config';
import { mAtoDepth } from '../utils/sensor';

function History() {
  const [data, setData] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
//  const [limit] = useState(10);
//  const [offset, setOffset] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const today = new Date().toISOString().split('T')[0];
  // const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => { 
    setStartDate(today);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [deviceId, startDate, endDate]);

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

      // const sorted = res.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      // setData(sorted);
      setData(res.data || []);
      setLoading(false);
    } catch (err) {
      console.error('取得歷史資料錯誤', err);
      setData([]);
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
  const filterDeviceOptions = () => {
    const allDeviceOptions = [];

    Object.entries(deviceMapping).forEach(([areaKey, area]) => {
      const filteredDevices = area.devices.filter(device =>
        !searchTerm ||
        device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
  const getFilteredTableData  = () => {
     if (!searchTerm && deviceId) { // 如果指定了 deviceId，且沒有額外搜尋詞，直接用 API 返回的 (已過濾)
        return data;
    }
    if (!searchTerm && !deviceId) { // 如果沒選 deviceId 且沒搜尋詞，顯示全部
        return data;
    }

    // 如果有 searchTerm，則在當前 data 基礎上進行前端過濾
    return data.filter(entry => {
      // 嘗試從 deviceMapping 中找到與 entry.deviceId 匹配的裝置配置
      let deviceConfig;
      let foundInMapping = false;
      Object.values(deviceMapping).some(area => {
        deviceConfig = area.devices.find(d => d.id === entry.deviceId);
        if (deviceConfig) {
          foundInMapping = true;
          return true; // 找到即停止
        }
        return false;
      });

      // 如果在 mapping 中找到了配置，則根據配置中的 name 和 id 進行搜尋
      if (foundInMapping && deviceConfig) {
        return (
          deviceConfig.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (deviceConfig.id && deviceConfig.id.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      }
      // 如果 mapping 中沒有找到 (例如 TDR_T14_T3 這種直接用 ID 的)，則直接對 entry.deviceId 進行搜尋
      // 或者，如果 deviceId 是選中的，且 searchTerm 用於進一步過濾 (雖然通常 searchTerm 是用來選 deviceId 的)
      return entry.deviceId?.toLowerCase().includes(searchTerm.toLowerCase());
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
                  <th className="px-4 py-3 font-semibold text-gray-700 text-right">數值/操作</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredTableData().map((entry, index) => { // ✨ 使用 getFilteredTableData()
                  let deviceConfig;
                  Object.values(deviceMapping).some(area => {
                    deviceConfig = area.devices.find(device => device.id === entry.deviceId);
                    return deviceConfig;
                  });

                  if (!deviceConfig || !entry.timestamp) return null;

                  const isTdrEntry = entry.source === 'tdr' || deviceConfig.type === DEVICE_TYPES.TDR;

                  if (isTdrEntry) {
                  // ✨ TDR 數據的新列佈局
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
                        <td className="px-4 py-3">{deviceConfig.name}</td> {/* 站名 */}
                        <td className="px-4 py-3">{deviceConfig.id} (TDR)</td> {/* 設備ID 和類型 */}
                        <td className="px-4 py-3 text-center">-</td> {/* 類型/通道 */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              // ✨ 使用 navigate 跳轉到 TrendPage
                              // 將 timestamp 進行 URL 編碼，以防特殊字符
                              navigate(`/trend?deviceId=${entry.deviceId}×tamp=${encodeURIComponent(entry.timestamp)}`);
                            }}
                            className="text-blue-600 hover:text-blue-800 underline px-2 py-1 rounded hover:bg-blue-50"
                          >
                            查看曲線
                          </button>
                        </td>
                      </tr>
                    );
                  } else {
                    return deviceConfig.sensors?.flatMap((sensor, sIdx) => {
                      return sensor.channels.map(ch => {
                        const chData = entry.channels?.[ch];
                        // WISE 雨量筒的特殊處理，如果後端已經處理好 rainfall_10m 或類似的，直接用
                        // 否則，可以嘗試從 raw 數據中獲取 'DI_x Cnt'
                        const isRain = sensor.type === DEVICE_TYPES.RAIN;
                        let displayValue, deltaValueText, deltaColorClass;

                        if (isRain) {
                          // 假設後端會傳回處理好的10分鐘雨量在 entry.rainfall_10m
                          // 或者您可以從 entry.raw[`${ch} Cnt`] 計算
                          const rainAmount = entry.rainfall_10m ?? (entry.raw?.[`${ch} Cnt`] !== undefined ? parseFloat(entry.raw[`${ch} Cnt`]) / 2 : undefined);
                          displayValue = rainAmount !== undefined ? `${rainAmount.toFixed(1)} mm` : 'N/A';
                          deltaValueText = '-'; // 雨量不顯示變化量或顯示當前值
                          deltaColorClass = '';
                        } else if (chData || (entry.raw && entry.raw[`${ch} EgF`])) {
                            const egf = chData ? Number(chData.EgF) : Number(entry.raw[`${ch} EgF`]);
                            const init = sensor.initialValues?.[ch] ?? 0;
                            const delta = egf - init;
                            const isWater = sensor.type === DEVICE_TYPES.WATER; // 注意：sensor.type 來自 config
                            const raw = egf;
                            displayValue = isNaN(raw) ? 'N/A' : (isWater
                              ? `${mAtoDepth(raw, sensor.wellDepth).toFixed(2)} m`
                              : raw.toFixed(3));
                            deltaValueText = isNaN(delta) ? '-' : delta.toFixed(3);
                            deltaColorClass = getStatusColor(delta);
                        } else {
                            return null; // 如果沒有相關數據，不渲染此通道行
                        }

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
                            <td className="px-4 py-3">{ch}</td> {/* 類型/通道 */}
                            <td className="px-4 py-3 text-right font-medium"> {/* 數值/操作 */}
                                {displayValue}
                                <span className={`ml-2 ${deltaColorClass}`}>({deltaValueText})</span> {/* 將變化量顯示在數值旁邊 */}
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