import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import { API_BASE, deviceMapping } from '../config/config';

import GEIcon from '../assets/GE.png';
import RAINIcon from '../assets/RAIN.png';
import TIIcon from '../assets/TI.png';
import waterIcon from '../assets/water.png';
import TDRIcon from '../assets/TDR.png';

const stations = Object.values(deviceMapping).flatMap(area =>
  area.devices.map(device => ({
    id: device.mac || device.id,
    name: device.name,
    lat: device.lat,
    lng: device.lng,
    deviceId: device.mac ? `WISE-4010LAN_${device.mac}` : device.id,
    type: device.sensors?.[0]?.type || device.type,
  }))
);

// 然後使用 allStations 生成 Marker
{stations.map(station => (
  <Marker
    key={station.id}
    position={[station.lat, station.lng]}
    icon={getIconByType(station.type)}
    eventHandlers={{ click: () => handleLoadData(station.deviceId) }}
  >
    <Popup>
      <div className="text-sm">
        <strong>{station.name}</strong><br />
        <button onClick={() => navigate(`/trend?deviceId=${station.deviceId}`)} className="text-blue-600 underline">
          查看詳細
        </button>
      </div>
    </Popup>
  </Marker>
))}

function getIconByType(type) {
  const url = {
    GE: GEIcon,
    RAIN: RAINIcon,
    TI: TIIcon,
    WATER: waterIcon,
    TDR: TDRIcon
  }[type] || TIIcon;

  return new L.Icon({
    iconUrl: url,
    iconSize: [32, 32],    // 可自行調整大小
    iconAnchor: [16, 32],  // 圖片底部中心
    popupAnchor: [0, -32],
    shadowUrl: null
  });
}

function ZoomToAreaButton({ label, center, zoom }) {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo(center, zoom)}
      className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 mr-2 mb-2"
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
      const res = await axios.get(`${API_BASE}/api/latest?deviceId=${deviceId}`);
      setDataCache(prev => ({ ...prev, [deviceId]: res.data[deviceId] }));
    } catch (err) {
      console.error('讀取數據失敗', err);
    }
  };

  return (
    <MapContainer center={[24.03, 121.16]} zoom={12} scrollWheelZoom={true} className="h-[80vh] w-full rounded-xl shadow">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* 🔍 控制按鈕 */}
      <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 p-3 rounded shadow">
        <ZoomToAreaButton label="春陽區" center={[24.03, 121.16]} zoom={18} />
        <ZoomToAreaButton label="梅峰區" center={[24.089, 121.174]} zoom={17} />
        <ZoomToAreaButton label="90k區" center={[24.0255, 121.183611]} zoom={17} />
      </div>

      {/* 📍 站點標記列表 */}
      {stations.map(station => (
        <Marker
          key={station.id}
          position={[station.lat, station.lng]}
          icon={getIconByType(station.type)}
          eventHandlers={{ click: () => handleLoadData(station.deviceId) }}
        >
          <Popup>
            <div className="text-sm">
              <strong>{station.name}</strong><br />
              <button onClick={() => navigate(`/station/${station.deviceId}`)} className="text-blue-600 underline">查看詳細</button>
              <hr className="my-1" />
              {dataCache[station.deviceId]?.timestamp ? (
                <div>
                  <p>時間：{dataCache[station.deviceId].timestamp}</p>
                  {Object.entries(dataCache[station.deviceId].channels || {}).map(([ch, val]) => (
                    <p key={ch}>{ch}: {val.EgF ?? '-'}</p>
                  ))}
                </div>
              ) : (
                <p>載入中或無資料</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default InteractiveMap;