import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
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
      className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow hover:from-blue-600 hover:to-indigo-700 transition-colors mr-2 mb-2"
    >
      {label}
    </button>
  );
}

function InteractiveMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const markerRefs = useRef({});
  const [dataCache, setDataCache] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({ TI: true, WATER: true, RAIN: true, GE: true, TDR: true });
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);

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
    const results = stations.filter(st => st.name.toLowerCase().includes(kw) || st.deviceId.toLowerCase().includes(kw));
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

  return (
    <MapContainer
      center={[24.03, 121.16]}
      zoom={12}
      scrollWheelZoom={true}
      whenCreated={mapInstance => (mapRef.current = mapInstance)}
      className="h-[80vh] w-full rounded-xl shadow-lg overflow-hidden relative"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

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
        <div className="mt-3 relative">
          <input
            type="text"
            placeholder="搜尋裝置名稱"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none"
          />
          {searchResults.length > 0 && (
            <ul className="absolute left-0 w-full mt-1 bg-white border border-gray-200 rounded shadow z-50 max-h-48 overflow-auto text-sm">
              {searchResults.map((st, index) => (
                <li
                  key={st.id}
                  onClick={() => handleSearchSelect(st)}
                  className={`px-3 py-1 hover:bg-blue-100 cursor-pointer ${index === highlightIndex ? 'bg-blue-100' : ''}`}
                >
                  {st.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <MarkerClusterGroup disableClusteringAtZoom={18}>
        {stations.filter(st => visibleLayers[st.type]).map(st => {
          const latestData = dataCache[st.deviceId];
          let abnormal = false;
          if (latestData && st.sensors[0]) abnormal = isNormalData(latestData, st.sensors[0]);

          return (
            <Marker
              key={st.id}
              position={[st.lat, st.lng]}
              icon={getIconByType(st.type, abnormal)}
              ref={(ref) => (markerRefs.current[st.id] = ref)}
              eventHandlers={{
                click: () => {
                  handleLoadData(st.deviceId);
                  bringMarkerToFront(st.id);
                }
              }}
            >
              <Popup className="rounded-lg shadow-lg">
                <div className="p-3">
                  <h3 className="font-bold text-lg mb-1">{st.name}</h3>
                  <button onClick={() => navigate(`/trend?deviceId=${st.deviceId}`)} className="text-blue-600 underline mb-2 block">查看詳細</button>
                  <hr className="my-2" />
                  {latestData?.timestamp ? (
                    <div className="text-sm">
                      <p className="mb-1">時間：{latestData.timestamp}</p>
                      {st.sensors && st.type === DEVICE_TYPES.TI ? (
                        st.sensors.slice(0,2).map((sensor, idx) => {
                          const channel = sensor.channels[0];
                          const chData = latestData.channels?.[channel];
                          const egf = chData?.Delta ?? null;
                          let sensorLabel = sensor.name.replace(/.*(A軸|B軸)/, '$1');
                          return (
                            <p key={idx} className="text-gray-700">
                              {sensorLabel}: {egf !== null ? egf.toFixed(3) : '-'}
                            </p>
                          );
                        })
                      ) : (
                        st.sensors?.map((sensor, idx) => (
                          <div key={idx} className="space-y-1">
                            {(sensor.channels).map((ch, index) => {
                              const chData = latestData.channels?.[ch];
                              // 若有多個通道，加上序號
                              const label = sensor.name;
                              let display;
                              if (st.type === DEVICE_TYPES.WATER) {
                                display = chData?.PEgF != null ? `${chData?.PEgF.toFixed(2)} m` : '-';
                              } else if (st.type === DEVICE_TYPES.RAIN) {
                                display = latestData.rainfall_10m != null ? `${latestData.rainfall_10m.toFixed(1)} mm` : '-';
                              } else if (st.type === DEVICE_TYPES.GE) {
                                display = chData?.Delta != null ? `${chData?.Delta.toFixed(2)} mm` : '-';
                              } else if (st.type === DEVICE_TYPES.TI) {
                                display = chData?.Delta != null ? chData?.Delta.toFixed(3) : '-';
                              } else {
                                display = chData?.EgF != null ? chData?.EgF.toFixed(3) : '-';
                              }
                              return (
                                <p key={ch} className="text-gray-700">
                                  {label}: {display}
                                </p>
                              );
                            })}
                          </div>
                        ))
                      )}
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
