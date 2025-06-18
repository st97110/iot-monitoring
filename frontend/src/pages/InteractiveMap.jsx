import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate, useParams  } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-markercluster';

import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES } from '../config/config';

const stations = Object.values(deviceMapping).flatMap(area =>
  area.devices.map(device => ({
    id: device.mac || device.id,
    name: device.name,
    lat: device.lat,
    lng: device.lng,
    deviceId: device.mac ? `WISE-4010LAN_${device.mac}` : device.id,
    type: device.type,
    sensors: device.sensors || []
  }))
);

function isNormalData(device, chData) {
    if (device.type === DEVICE_TYPES.RAIN && chData?.rainfall_10m < 10) return true;          // 雨量筒小於 10 顯示為正常
    else if (device.type === DEVICE_TYPES.GE && Math.abs(chData?.Delta) < 50) return true;       // 伸縮計小於 30 顯示為正常
    else if (device.type === DEVICE_TYPES.TI && Math.abs(chData?.Delta) < 2 * 3600) return true; // 傾斜儀小於 5 度顯示為正常
    else if (device.type === DEVICE_TYPES.WATER && chData?.PEgF < -15) return true; // 水位計小於 -15 公尺顯示為正常
    return false;
  }

function getIconByType(type, abnormal) {
  let text = '';
  let baseColor = '';
  switch (type) {
    case 'TI': text = 'TI'; baseColor = 'bg-blue-500'; break;
    case 'RAIN': text = 'R'; baseColor = 'bg-purple-500'; break;
    case 'GE': text = 'GE'; baseColor = 'bg-green-500'; break;
    case 'WATER': text = 'W'; baseColor = 'bg-cyan-500'; break;
    case 'TDR': text = 'TDR'; baseColor = 'bg-indigo-500'; break;
    default: text = '?'; baseColor = 'bg-gray-500';
  }
  const border = abnormal ? 'border-2 border-red-500' : '';
  return L.divIcon({
    html: `<div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${baseColor} ${border}">${text}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
}

function ZoomToAreaButton({ label, center, zoom }) {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo(center, zoom)}
      className="px-3 py-1.5 text-xs sm:text-sm rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow hover:from-blue-600 hover:to-indigo-700 transition-colors mr-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      {label}
    </button>
  );
}

function InteractiveMap() {
  const navigate = useNavigate();
  const { routeGroup } = useParams(); // 獲取路由參數
  const mapRef = useRef(null);
  const markerRefs = useRef({});
  const [dataCache, setDataCache] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({ TI: true, WATER: true, RAIN: true, GE: true, TDR: true });
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // 根據 routeGroup 篩選初始顯示的 stations
  const displayedStations = useMemo(() => {
    if (!routeGroup) return stations; // 如果沒有 routeGroup (例如直接訪問 /map)，顯示全部
    return stations.filter(station => {
        // 需要從 deviceMapping 中找到 station.id 對應的配置，再看其 routeGroup
        for (const area of Object.values(deviceMapping)) {
            const deviceConf = area.devices.find(d => d.id === station.deviceId); // 假設 station.deviceId 是唯一的邏輯 ID
            if (deviceConf && area.routeGroup === routeGroup) {
                return true;
            }
        }
        return false;
    });
  }, [routeGroup]);

  const handleLoadData = async (deviceId) => {
    if (dataCache[deviceId]) return;
    try {
      const res = await axios.get(`${API_BASE}/api/latest?deviceId=${deviceId}`);
      setDataCache(prev => ({ ...prev, [deviceId]: res.data[deviceId] }));
    } catch (err) {
      console.error('讀取數據失敗', err);
    }
  };

  useEffect(() => {
    // 只加載 displayedStations 的數據
    displayedStations.forEach(station => handleLoadData(station.deviceId));
  }, [displayedStations]); // 當 displayedStations 變化時 (例如 routeGroup 變化)

  const bringMarkerToFront = (markerId) => {
    document.querySelectorAll('.leaflet-marker-icon').forEach(el => el.style.zIndex = 'auto');
    const el = markerRefs.current[markerId]?.getElement?.();
    if (el) el.style.zIndex = '9999';
  };

  const handleLayerToggle = (type) => {
    setVisibleLayers(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleSearchChange = (value) => {
    setSearchText(value);
    const kw = value.trim().toLowerCase();
    if (kw === '') {
      setSearchResults([]);
      setHighlightIndex(-1);
      return;
    }
    // 搜索範圍改為 displayedStations
    const results = displayedStations.filter(st => st.name.toLowerCase().includes(kw) || st.deviceId.toLowerCase().includes(kw));
    setSearchResults(results.slice(0, 8));
    setHighlightIndex(0);
  };

  const handleSearchSelect = (station) => {
    setSearchText(station.name);
    setSearchResults([]);
    setHighlightIndex(-1);
    if (mapRef.current) {
      mapRef.current.flyTo([station.lat, station.lng], 18, { animate: false });
      setTimeout(() => {
        const marker = markerRefs.current[station.id];
        if (marker) {
          marker.openPopup();
          bringMarkerToFront(station.id);
        }
      }, 500);
    }
  };

  const handleKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      setHighlightIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      setHighlightIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < searchResults.length) {
        handleSearchSelect(searchResults[highlightIndex]);
      }
    }
  };

  function MapController() {
    const map = useMap();
    useEffect(() => {
      if (map) {
        mapRef.current = map;
      }
    }, [map]);
    return null;
  }

  // 根據 routeGroup 決定地圖的初始中心點和縮放級別
  const initialCenter = useMemo(() => {
    if (routeGroup === 't14') return [24.05, 121.17]; // 台14線及甲線的中心
    if (routeGroup === 't8') return [24.1920, 121.3025];  // 台8線的中心 (假設)
    return [24.03, 121.16]; // 預設中心
  }, [routeGroup]);

  const initialZoom = useMemo(() => {
    if (routeGroup === 't14') return 12;
    if (routeGroup === 't8') return 16;
    return 12;
  }, [routeGroup]);

  return (
    // ✨ 給外層容器一個 class 以便 CSS 定位 (如果需要)
    <div className="map-container-wrapper relative h-[calc(100vh-var(--navbar-height,64px)-2rem)] w-full">
      <MapContainer
        center={initialCenter} // ✨ 使用動態中心點
        zoom={initialZoom}     // ✨ 使用動態縮放
        scrollWheelZoom={true}
        className="h-full w-full rounded-xl shadow-lg overflow-hidden"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController />

        {/* ZoomToAreaButton 區域 - 保持在左上角 */}
        <div className="absolute top-3 left-3 z-[1000] bg-white bg-opacity-80 p-2 sm:p-3 rounded-xl shadow-md flex flex-wrap gap-1 sm:gap-2">
          {/* ✨ 根據 routeGroup 動態顯示 ZoomToAreaButton */}
          {Object.values(deviceMapping).filter(area => !routeGroup || area.routeGroup === routeGroup).map(area => (
             area.defaultCenter && area.defaultZoom && // 確保 area 有中心點和縮放配置 
                <ZoomToAreaButton
                    key={area.name}
                    label={area.name}
                    center={area.defaultCenter}
                    zoom={area.defaultZoom}
                />
          ))}
        </div>

        {/* 圖例和搜索區域 - 右下角 */}
      <div className={`
          absolute z-[1000]
          bg-white bg-opacity-90 p-3 sm:p-4 rounded-xl shadow-md 
          w-[120px] sm:w-auto md:w-auto md:max-w-xs
          flex flex-col space-y-3
          transition-all duration-300 ease-in-out
          bottom-4 right-0
          md:bottom-5 md:right-0
        `}
      >
        <div> {/* 包裹顯示儀器圖例 */}
          <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">顯示儀器</h3>
          {Object.entries(visibleLayers).map(([type, visible]) => (
            <label key={type} className="flex items-center text-xs sm:text-sm mb-1 cursor-pointer">
              <input type="checkbox" checked={visible} onChange={() => handleLayerToggle(type)} className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-1.5 sm:mr-2 ${getIconByType(type, false).options.html.match(/bg-[^\s"]+/)?.[0] || 'bg-gray-500'}`}></span>
              {DEVICE_TYPE_NAMES[type]} <span className="hidden sm:inline">({type})</span>
            </label>
          ))}
        </div>
          <div className="relative"> {/* 搜索框 */}
            <input
              type="text"
              placeholder="搜尋裝置"
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchResults.length > 0 && (
              <ul className="absolute left-0 right-0 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-40 overflow-auto text-xs sm:text-sm">
                {searchResults.map((st, index) => (
                  <li
                    key={st.id}
                    onClick={() => handleSearchSelect(st)}
                    className={`px-2.5 py-1.5 hover:bg-blue-100 cursor-pointer ${index === highlightIndex ? 'bg-blue-100' : ''}`}
                  >
                    {st.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <MarkerClusterGroup disableClusteringAtZoom={18}>
          {/* ✨ 使用 displayedStations 進行渲染 */}
          {displayedStations.filter(st => visibleLayers[st.type]).map(st => {
            const latestData = dataCache[st.deviceId];
            let isDeviceAbnormal = false; // ✨ 預設正常
            if (latestData && latestData.channels && st.sensors && st.sensors.length > 0) {
              // 檢查該設備的所有感測器和通道，是否有一個是異常的
                // isNormalData 需要 deviceConfig (這裡的 st 就是) 和 channelData
                // 我們需要遍歷 st.sensors
                for (const sensor of st.sensors) {
                    for (const channelKey of sensor.channels) {
                        const chData = latestData.channels[channelKey];
                        if (chData && !isNormalData(st, chData)) { // 假設 isNormalData 接收 device 和 chData
                            isDeviceAbnormal = true;
                            break; // 只要有一個異常，整個設備標記異常
                        }
                    }
                    if (isDeviceAbnormal) break;
                }
            } else if (latestData && st.type === DEVICE_TYPES.RAIN) { // 雨量筒的異常判斷
                 if (latestData.rainfall_10m !== undefined && !isNormalData(st, { rainfall_10m: latestData.rainfall_10m })) {
                     isDeviceAbnormal = true;
                 }
            }
            
            return (
              <Marker
                key={st.id} // 這裡的 st.id 應該是唯一的 (來自最初的 stations 陣列)
                position={[st.lat, st.lng]}
                icon={getIconByType(st.type, isDeviceAbnormal)} // 使用 isDeviceAbnormal
                ref={(ref) => (markerRefs.current[st.id] = ref)}
                eventHandlers={{
                  click: () => {
                    handleLoadData(st.deviceId); // st.deviceId 是唯一的邏輯 ID
                    bringMarkerToFront(st.id);
                  }
                }}
              >
                <Popup className="rounded-lg shadow-lg custom-popup-width"> {/* 可選：自定義Popup寬度 */}
                  <div className="p-1 sm:p-2">
                    <h3 className="font-bold text-base sm:text-lg mb-1">{st.name}</h3>
                    {/* ✨ 根據 routeGroup 構建正確的趨勢圖連結 */}
                    <button onClick={() => navigate(`/${routeGroup}/trend?deviceId=${st.deviceId}`)} className="text-blue-600 underline mb-2 block text-xs sm:text-sm">查看詳細</button>
                    <hr className="my-1 sm:my-2" />
                    {latestData?.timestamp ? (
                      <div className="text-xs sm:text-sm space-y-0.5">
                        <p>時間：{new Date(latestData.timestamp).toLocaleString('zh-TW', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</p>
                        {/* ✨ Popup 內容顯示邏輯與 Home.jsx 類似 */}
                        {st.type === DEVICE_TYPES.RAIN && latestData.rainfall_10m !== null && (
                            <p className="text-gray-700">10分鐘雨量: {latestData.rainfall_10m.toFixed(1)} mm</p>
                        )}
                        {st.type !== DEVICE_TYPES.RAIN && st.type !== DEVICE_TYPES.TDR && st.sensors?.map((sensor, sIdx) => (
                            sensor.channels.map((ch) => {
                                const chData = latestData.channels?.[ch];
                                // 這裡的 displayValue 需要一個類似 Home.jsx 中的 formatValue
                                // 我們暫時簡化顯示原始 Delta 或 PEgF
                                let display = '-';
                                if (chData) {
                                    if (st.type === DEVICE_TYPES.WATER) display = chData.PEgF != null ? `${chData.PEgF.toFixed(2)} m` : '-';
                                    else if (st.type === DEVICE_TYPES.GE) display = chData.Delta != null ? `${chData.Delta.toFixed(2)} mm` : '-';
                                    else if (st.type === DEVICE_TYPES.TI) display = chData.Delta != null ? chData.Delta.toFixed(1) + ' "' : '-'; // TI 用一度的小數位
                                    else display = chData.EgF != null ? chData.EgF.toFixed(3) : '-';
                                }
                                return (
                                    <p key={`${sIdx}-${ch}`} className="text-gray-700">
                                        {sensor.name.replace(/\(.*\)/, '').trim()} ({ch.replace('AI_','').replace('DI_','')}) : {display}
                                    </p>
                                );
                            })
                        ))}
                        {st.type === DEVICE_TYPES.TDR && <p className="text-gray-500 italic">TDR數據請查看詳細</p>}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-xs sm:text-sm">載入中或無即時數據...</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default InteractiveMap;
