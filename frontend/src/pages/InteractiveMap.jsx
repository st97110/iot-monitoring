import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import { API_BASE } from '../config/config';

import GEIcon from '../assets/GE.png';
import RAINIcon from '../assets/RAIN.png';
import TIIcon from '../assets/TI.png';
import waterIcon from '../assets/water.png';
import TDRIcon from '../assets/TDR.png';

// 叫AI整合進deviceMapping.js TDR的部分用id取代WISE4010的MAC部分
const stations = [
  { id: 'T1', name: 'T1 TDR', lat: 24.0175, lng: 121.128056, deviceId: '', type: 'TDR' },
  { id: 'T2', name: 'T2 TDR', lat: 24.018056, lng: 121.129444, deviceId: '', type: 'TDR' },

  { id: 'AH3', name: 'AH3 TDR', lat: 24.029722, lng: 121.161389, deviceId: '', type: 'TDR' },
  { id: '84.6k', name: '84.6k傾斜儀', lat: 24.0301, lng: 121.16, deviceId: 'WISE-4010LAN_74FE48941ABE', type: 'TI' },
  { id: '84.65k', name: '84.65k傾斜儀', lat: 24.0302, lng: 121.16, deviceId: 'WISE-4010LAN_00D0C9FAD2E3', type: 'TI' },
  { id: '84.7k', name: '84.7k傾斜儀', lat: 24.0303, lng: 121.16, deviceId: 'WISE-4010LAN_00D0C9FAD2C9', type: 'TI' },
  
  { id: 'T3', name: 'T3 TDR', lat: 24.025278, lng: 121.183611, deviceId: '', type: 'TDR' },
  { id: 'T4', name: 'T4 TDR', lat: 24.026667, lng: 121.183889, deviceId: '', type: 'TDR' },
  { id: '91.5k', name: '91.5k雨量筒', lat: 24.026667, lng: 121.183889, deviceId: 'WISE-4010LAN_74FE489299F4', type: 'RAIN' },

  { id: '14.25k', name: '14.25k傾斜儀', lat: 24.075278, lng: 121.183611, deviceId: 'WISE-4010LAN_00D0C9FAC4F8', type: 'TI' },
  { id: '14.27k', name: '14.27k傾斜儀', lat: 24.076667, lng: 121.183889, deviceId: 'WISE-4010LAN_74FE489299CB', type: 'TI' },
  { id: 'CH1', name: 'CH1 TDR', lat: 24.086667, lng: 121.173689, deviceId: '', type: 'TDR' },
  { id: 'GE1', name: 'GE1', lat: 24.089444, lng: 121.173611, deviceId: 'WISE-4010LAN_74FE489299F4', type: 'GE' },
  { id: 'GE2', name: 'GE2', lat: 24.090833, lng: 121.173889, deviceId: 'WISE-4010LAN_74FE489299F4', type: 'GE' },
  { id: 'GE3', name: 'GE3', lat: 24.092222, lng: 121.174167, deviceId: 'WISE-4010LAN_74FE489299F4', type: 'GE' },
];

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
        <ZoomToAreaButton label="春陽區" center={[24.03, 121.16]} zoom={15} />
        <ZoomToAreaButton label="梅峰區" center={[24.089, 121.174]} zoom={17} />
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