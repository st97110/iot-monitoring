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

// 定義所有設備
const stations = Object.values(deviceMapping).flatMap(area =>
  area.devices.map(device => ({
    id: device.mac || device.id,
    name: device.name,
    lat: device.lat,
    lng: device.lng,
    deviceId: device.mac ? `WISE-4010LAN_${device.mac}` : device.id,
    // 從第一個感測器取得 type
    type: device.sensors?.[0]?.type || device.type,
    sensors: device.sensors || []
  }))
);

// 判斷是否異常：如果任一通道 EgF 絕對值大於或等於 1，視為異常
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

// 修改 getIconByType()，加入 abnormal 參數
function getIconByType(type, abnormal) {
  const url = {
    GE: GEIcon,
    RAIN: RAINIcon,
    TI: TIIcon,
    WATER: waterIcon,
    TDR: TDRIcon
  }[type] || TIIcon;

  if (abnormal) {
    // 這裡可以切換成紅色版圖示，如果沒有可以用同一圖示但稍大顯示異常(示範用)
    return new L.Icon({
      iconUrl: url,
      iconSize: [36, 36],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
      shadowUrl: null
    });
  }
  return new L.Icon({
    iconUrl: url,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -20],
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
      {/* 控制按鈕 */}
      <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 p-3 rounded shadow">
        <ZoomToAreaButton label="80k區" center={[24.0178, 121.1285]} zoom={18} />
        <ZoomToAreaButton label="春陽區" center={[24.03, 121.16]} zoom={18} />
        <ZoomToAreaButton label="90k區" center={[24.0255, 121.183611]} zoom={17} />
        <ZoomToAreaButton label="梅峰區" center={[24.089, 121.174]} zoom={17} />
      </div>
      {/* 站點標記列表 */}
      {stations.map(station => {
        // 若該設備有最新數據，判斷是否異常（根據第一個感測器）
        const latestData = dataCache[station.deviceId];
        let abnormal = false;
        if (latestData && station.sensors[0]) {
          abnormal = isAbnormalData(latestData, station.sensors[0]);
        }
        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={getIconByType(station.type, abnormal)}
            eventHandlers={{ click: () => handleLoadData(station.deviceId) }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{station.name}</strong>
                <br />
                <button 
                  onClick={() => navigate(`/trend?deviceId=${station.deviceId}`)} 
                  className="text-blue-600 underline"
                >
                  查看詳細
                </button>
                <hr className="my-1" />
                {latestData?.timestamp ? (
                  <div>
                    <p>時間：{latestData.timestamp}</p>
                    {Object.entries(latestData.channels || {}).map(([ch, val]) => (
                      <p key={ch}>{ch}: {val.EgF ?? '-'}</p>
                    ))}
                  </div>
                ) : (
                  <p>載入中或無資料</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default InteractiveMap;
