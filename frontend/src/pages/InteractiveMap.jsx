// InteractiveMap.jsx
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
// 引入 MarkerClusterGroup 套件
import MarkerClusterGroup from 'react-leaflet-markercluster';

import { API_BASE, deviceMapping } from '../config/config';

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
  console.log('getIconByType called with:', { type, abnormal });
  let text = '';
  let baseColor = '';
  switch (type) {
    case 'TI':
      text = 'TI';
      baseColor = 'bg-blue-500';
      break;
    case 'RAIN':
      text = 'R';
      baseColor = 'bg-purple-500';
      break;
    case 'GE':
      text = 'GE';
      baseColor = 'bg-green-500';
      break;
    case 'WATER':
      text = 'W';
      baseColor = 'bg-cyan-500';
      break;
    case 'TDR':
      text = 'TDR';
      baseColor = 'bg-indigo-500';
      break;
    default:
      text = '?';
      baseColor = 'bg-gray-500';
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
      onClick={() => {
        console.log('ZoomToAreaButton clicked:', label, center, zoom);
        map.flyTo(center, zoom);
      }}
      className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow hover:from-blue-600 hover:to-indigo-700 transition-colors mr-2 mb-2"
    >
      {label}
    </button>
  );
}

function InteractiveMap() {
  const navigate = useNavigate();
  const [dataCache, setDataCache] = useState({});

  const handleLoadData = async (deviceId) => {
    if (dataCache[deviceId]) return;
    try {
      console.log('Fetching latest data for:', deviceId);
      const res = await axios.get(`${API_BASE}/api/latest?deviceId=${deviceId}`);
      setDataCache(prev => ({ ...prev, [deviceId]: res.data[deviceId] }));
    } catch (err) {
      console.error('讀取數據失敗', err);
    }
  };

  // 一開始就載入所有資料
  useEffect(() => {
    stations.forEach(station => {
      handleLoadData(station.deviceId);
    });
  }, []);

  return (
    <MapContainer
      center={[24.03, 121.16]}
      zoom={12}
      scrollWheelZoom={true}
      className="h-[80vh] w-full rounded-xl shadow-lg overflow-hidden relative"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 控制按鈕 */}
      <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 p-4 rounded-xl shadow-md">
        <ZoomToAreaButton label="80k區" center={[24.0178, 121.1285]} zoom={18} />
        <ZoomToAreaButton label="春陽區" center={[24.03, 121.16]} zoom={18} />
        <ZoomToAreaButton label="90k區" center={[24.0255, 121.183611]} zoom={17} />
        <ZoomToAreaButton label="梅峰區" center={[24.089, 121.174]} zoom={17} />
      </div>

      {/* MarkerClusterGroup 包住所有標記 */}
      <MarkerClusterGroup>
        {stations.map(station => {
          const latestData = dataCache[station.deviceId];
          let abnormal = false;
          if (latestData && station.sensors[0]) {
            abnormal = isAbnormalData(latestData, station.sensors[0]);
          }
          console.log('Rendering marker for:', station.name, { abnormal, latestData });
          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={getIconByType(station.type, abnormal)}
              eventHandlers={{ click: () => handleLoadData(station.deviceId) }}
            >
              <Popup className="rounded-lg shadow-lg">
                <div className="p-3">
                  <h3 className="font-bold text-lg mb-1">{station.name}</h3>
                  <button 
                    onClick={() => navigate(`/trend?deviceId=${station.deviceId}`)} 
                    className="text-blue-600 underline mb-2 block"
                  >
                    查看詳細
                  </button>
                  <hr className="my-2" />
                  {latestData?.timestamp ? (
                    <div className="text-sm">
                      <p className="mb-1">時間：{latestData.timestamp}</p>
                      {Object.entries(latestData.channels || {}).map(([ch, val]) => (
                        <p key={ch} className="text-gray-700">
                          {ch}: {val.EgF ?? '-'}
                        </p>
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
