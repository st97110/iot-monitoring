// InteractiveMap.jsx
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-markercluster';

import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES } from '../config/config';

const stations = Object.values(deviceMapping).flatMap(area =>
  area.devices.map(device => ({
    id: device.mac || device.id,
    name: device.name,
    lat: device.lat,
    lng: device.lng,
    deviceId: device.mac ? `WISE-4010LAN_${device.mac}` : device.id,
    type: device.sensors?.[0]?.type || device.type,
    sensors: device.sensors || []
  }))
);

function isAbnormalData(data, sensor) {
  if (!data || !sensor) return false;
  const threshold = 1;
  return sensor.channels.some(ch => {
    const chData = data.channels?.[ch];
    if (!chData) return false;
    const egf = chData.EgF;
    return typeof egf === 'number' && Math.abs(egf) >= threshold;
  });
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
      className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow hover:from-blue-600 hover:to-indigo-700 transition-colors mr-2 mb-2"
    >
      {label}
    </button>
  );
}

function InteractiveMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null); // 確保初始化為 null
  const markerRefs = useRef({});
  const [dataCache, setDataCache] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({ TI: true, WATER: true, RAIN: true, GE: true, TDR: true });
  const [searchText, setSearchText] = useState('');

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
    stations.forEach(station => handleLoadData(station.deviceId));
  }, []);

  const handleLayerToggle = (type) => {
    setVisibleLayers(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleSearch = () => {
    const match = stations.find(st => st.name.includes(searchText));
    if (match && mapRef.current) {
      const map = mapRef.current;
      map.flyTo([match.lat, match.lng], 18);
      setTimeout(() => {
        const marker = markerRefs.current[match.id];
        if (marker) marker.openPopup();
      }, 500); // 加入延遲確保地圖移動完成後再開啟彈窗
    }
  };

  // 創建一個新的組件來訪問地圖實例
  function MapController() {
    const map = useMap();
    
    // 使用 useEffect 來設置 mapRef
    useEffect(() => {
      if (map) {
        mapRef.current = map;
      }
    }, [map]);
    
    return null;
  }

  return (
    <MapContainer
      center={[24.03, 121.16]}
      zoom={12}
      scrollWheelZoom={true}
      whenCreated={mapInstance => mapRef.current = mapInstance}
      className="h-[80vh] w-full rounded-xl shadow-lg overflow-hidden relative"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 添加控制器組件來獲取地圖引用 */}
      <MapController />

      <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 p-4 rounded-xl shadow-md">
        <ZoomToAreaButton label="80k區" center={[24.0178, 121.1285]} zoom={18} />
        <ZoomToAreaButton label="春陽區" center={[24.03, 121.16]} zoom={18} />
        <ZoomToAreaButton label="90k區" center={[24.0255, 121.183611]} zoom={17} />
        <ZoomToAreaButton label="梅峰區" center={[24.089, 121.174]} zoom={17} />
      </div>

      <div className="absolute top-4 right-4 z-[1000] bg-white bg-opacity-90 p-4 rounded-xl shadow-md w-52">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">顯示儀器</h3>
        {Object.entries(visibleLayers).map(([type, visible]) => (
          <label key={type} className="flex items-center text-sm mb-1">
            <input type="checkbox" checked={visible} onChange={() => handleLayerToggle(type)} className="mr-2" />
            <span className={`w-3 h-3 rounded-full mr-2 ${getIconByType(type, false).options.html.match(/bg-[^\s"]+/)?.[0] || 'bg-gray-500'}`}></span>
            {DEVICE_TYPE_NAMES[type]} ({type})
          </label>
        ))}
        <div className="mt-3 flex items-center space-x-2">
          <input
            type="text"
            placeholder="搜尋裝置"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none"
          />
          <button onClick={handleSearch} className="px-2 py-1 text-nowrap text-sm bg-blue-600 text-white rounded hover:bg-blue-700">搜尋</button>
        </div>
      </div>

      <MarkerClusterGroup disableClusteringAtZoom={18}>
        {stations.filter(st => visibleLayers[st.type]).map(st => {
          const latestData = dataCache[st.deviceId];
          let abnormal = false;
          if (latestData && st.sensors[0]) abnormal = isAbnormalData(latestData, st.sensors[0]);

          return (
            <Marker
              key={st.id}
              position={[st.lat, st.lng]}
              icon={getIconByType(st.type, abnormal)}
              ref={(ref) => (markerRefs.current[st.id] = ref)}
              eventHandlers={{ click: () => handleLoadData(st.deviceId) }}
            >
              <Popup className="rounded-lg shadow-lg">
                <div className="p-3">
                  <h3 className="font-bold text-lg mb-1">{st.name}</h3>
                  <button onClick={() => navigate(`/trend?deviceId=${st.deviceId}`)} className="text-blue-600 underline mb-2 block">查看詳細</button>
                  <hr className="my-2" />
                  {latestData?.timestamp ? (
                    <div className="text-sm">
                      <p className="mb-1">時間：{latestData.timestamp}</p>
                      {Object.entries(latestData.channels || {}).map(([ch, val]) => (
                        <p key={ch} className="text-gray-700">{ch}: {val.EgF ?? '-'}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">載入中或無資料</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

export default InteractiveMap;