import { useState, useEffect, useRef, useMemo, KeyboardEvent } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { Map as LeafletMap } from 'leaflet';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES, Device } from '../config/config';
import { isNormalData, formatValue } from '../utils/sensor';
import type { LatestResponse, WiseLatestRecord } from '../types/api';
import PageContainer from '../components/PageContainer';
import PageHeader from '../components/PageHeader';

interface StationShape {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: DEVICE_TYPES;
  sensors: Device['sensors'];
  originalDeviceId: string;
}

const stations: StationShape[] = Object.values(deviceMapping).flatMap(area =>
  area.devices
    .filter(d => d.lat != null && d.lng != null)
    .map(device => ({
      id: device.id,
      name: device.name,
      lat: device.lat!,
      lng: device.lng!,
      type: device.type,
      sensors: device.sensors || [],
      originalDeviceId: device.originalDeviceId || device.id,
    })),
);

function getIconByType(type: DEVICE_TYPES | string | undefined, abnormal: boolean): L.DivIcon {
  // 跟 Home 卡片用同一組色票（type 色），異常時加紅色 ring
  let text = '';
  let bg = '';
  switch (type) {
    case 'TI':      text = 'TI';  bg = '#3B82F6'; break;  // blue-500
    case 'WATER':   text = 'W';   bg = '#06B6D4'; break;  // cyan-500
    case 'RAIN':    text = 'R';   bg = '#6366F1'; break;  // indigo-500
    case 'GE':      text = 'GE';  bg = '#22C55E'; break;  // green-500
    case 'TDR':     text = 'TDR'; bg = '#8B5CF6'; break;  // violet-500
    case 'FLOW':    text = 'FL';  bg = '#EC4899'; break;  // pink-500
    case 'BATTERY': text = 'B';   bg = '#F59E0B'; break;  // amber-500
    default:        text = '?';   bg = '#94A3B8'; break;  // slate-400
  }
  const ring = abnormal
    ? 'box-shadow: 0 0 0 3px #ef4444, 0 2px 6px rgba(0,0,0,0.25);'
    : 'box-shadow: 0 2px 6px rgba(0,0,0,0.18), 0 0 0 2px white;';
  return L.divIcon({
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};color:white;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;${ring}font-family:system-ui,sans-serif;">${text}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

interface ZoomButtonProps { label: string; center: [number, number]; zoom: number }
function ZoomToAreaButton({ label, center, zoom }: ZoomButtonProps) {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo(center, zoom)}
      className="px-2.5 py-1 text-xs rounded-md bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      {label}
    </button>
  );
}

type VisibleLayers = Partial<Record<string, boolean>>;

function InteractiveMap() {
  const navigate = useNavigate();
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});
  const [dataCache, setDataCache] = useState<Record<string, WiseLatestRecord | { error: string }>>({});
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    TI: true, WATER: true, RAIN: true, GE: true, TDR: true, FLOW: true, BATTERY: true,
  });
  const [searchText, setSearchText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<StationShape[]>([]);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);

  const displayedStations = useMemo<StationShape[]>(() => {
    if (!routeGroup) return stations;
    return stations.filter(station => {
      for (const area of Object.values(deviceMapping)) {
        const deviceConf = area.devices.find(d => d.id === station.id);
        if (deviceConf && area.routeGroup === routeGroup) return true;
      }
      return false;
    });
  }, [routeGroup]);

  const handleLoadData = async (stationConfig: StationShape) => {
    const physicalDeviceId = stationConfig.originalDeviceId || stationConfig.id;
    const logicalDeviceId = stationConfig.id;
    if (dataCache[logicalDeviceId]) return;
    try {
      const res = await axios.get<LatestResponse>(`${API_BASE}/api/latest?deviceId=${physicalDeviceId}`);
      setDataCache(prev => ({ ...prev, [logicalDeviceId]: res.data[physicalDeviceId] }));
    } catch (err) {
      console.error(`讀取設備 ${logicalDeviceId} (物理ID: ${physicalDeviceId}) 數據失敗`, err);
      setDataCache(prev => ({ ...prev, [logicalDeviceId]: { error: 'Failed to load data' } }));
    }
  };

  useEffect(() => {
    displayedStations.forEach(station => handleLoadData(station));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedStations]);

  const bringMarkerToFront = (markerId: string) => {
    document.querySelectorAll('.leaflet-marker-icon').forEach(el => {
      (el as HTMLElement).style.zIndex = 'auto';
    });
    const marker = markerRefs.current[markerId];
    const el = marker?.getElement();
    if (el) (el as HTMLElement).style.zIndex = '9999';
  };

  const handleLayerToggle = (type: string) => {
    setVisibleLayers(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    const kw = value.trim().toLowerCase();
    if (kw === '') { setSearchResults([]); setHighlightIndex(-1); return; }
    const results = displayedStations.filter(st => st.name.toLowerCase().includes(kw) || st.id.toLowerCase().includes(kw));
    setSearchResults(results.slice(0, 8));
    setHighlightIndex(0);
  };

  const handleSearchSelect = (station: StationShape) => {
    setSearchText(station.name);
    setSearchResults([]);
    setHighlightIndex(-1);
    if (mapRef.current) {
      mapRef.current.flyTo([station.lat, station.lng], 18, { animate: false });
      setTimeout(() => {
        const marker = markerRefs.current[station.id];
        if (marker) { marker.openPopup(); bringMarkerToFront(station.id); }
      }, 500);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') setHighlightIndex(prev => (prev + 1) % searchResults.length);
    else if (e.key === 'ArrowUp') setHighlightIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < searchResults.length) {
      handleSearchSelect(searchResults[highlightIndex]);
    }
  };

  function MapController() {
    const map = useMap();
    useEffect(() => {
      if (map) mapRef.current = map;
    }, [map]);
    return null;
  }

  const initialCenter = useMemo<[number, number]>(() => {
    if (routeGroup === 't14') return [24.05, 121.17];
    if (routeGroup === 't8') return [24.1923, 121.3032];
    return [24.03, 121.16];
  }, [routeGroup]);

  const initialZoom = useMemo<number>(() => {
    if (routeGroup === 't14') return 12;
    if (routeGroup === 't8') return 18;
    return 12;
  }, [routeGroup]);

  return (
    <PageContainer>
      <PageHeader
        title={`互動地圖${routeGroup === 't14' ? ' · 台14線及甲線' : routeGroup === 't8' ? ' · 台8線' : ''}`}
        subtitle="點擊標記查看即時數據"
      />
      <div className="map-container-wrapper relative h-[calc(100vh-220px)] min-h-[480px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="h-full w-full rounded-xl shadow-lg overflow-hidden"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        <MapController />

        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur p-2 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-1.5 max-w-[60%]">
          {Object.values(deviceMapping)
            .filter(area => !routeGroup || area.routeGroup === routeGroup)
            .map(area =>
              area.defaultCenter && area.defaultZoom && (
                <ZoomToAreaButton
                  key={area.name}
                  label={area.name}
                  center={area.defaultCenter}
                  zoom={area.defaultZoom}
                />
              ),
            )}
        </div>

        <div className="
            absolute z-[1000]
            bg-white/95 backdrop-blur p-3 rounded-xl shadow-sm border border-slate-200
            w-[140px] sm:w-auto md:max-w-xs
            flex flex-col space-y-3
            transition-all duration-300 ease-in-out
            bottom-4 right-3
          ">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">顯示儀器</h3>
            {Object.entries(visibleLayers).map(([type, visible]) => (
              <label key={type} className="flex items-center text-xs sm:text-sm mb-1 cursor-pointer">
                <input type="checkbox" checked={!!visible} onChange={() => handleLayerToggle(type)} className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-1.5 sm:mr-2 ${(getIconByType(type, false).options.html as string | undefined)?.match(/bg-[^\s"]+/)?.[0] || 'bg-gray-500'}`}></span>
                {DEVICE_TYPE_NAMES[type]} <span className="hidden sm:inline">({type})</span>
              </label>
            ))}
          </div>
          <div className="relative">
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
                  >{st.name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <MarkerClusterGroup disableClusteringAtZoom={18}>
          {displayedStations.filter(st => st.type && visibleLayers[st.type]).map(stationConfig => {
            const cached = dataCache[stationConfig.id];
            const latestData = cached && !('error' in cached) ? cached : undefined;
            let isDeviceAbnormal = false;

            if (latestData && stationConfig.sensors && stationConfig.sensors.length > 0) {
              const cfgAsDevice = stationConfig as unknown as Device;
              if (stationConfig.type === DEVICE_TYPES.RAIN) {
                if (latestData.rainfall_10m !== undefined && !isNormalData(cfgAsDevice, undefined, latestData.rainfall_10m as number, 'rainfall_10m')) {
                  isDeviceAbnormal = true;
                }
              } else {
                for (const sensor of stationConfig.sensors) {
                  for (const channelKey of sensor.channels) {
                    const chData = latestData.channels?.[channelKey];
                    if (!isNormalData(cfgAsDevice, sensor, chData, channelKey)) {
                      isDeviceAbnormal = true; break;
                    }
                  }
                  if (isDeviceAbnormal) break;
                }
              }
            }

            return (
              <Marker
                key={stationConfig.id}
                position={[stationConfig.lat, stationConfig.lng]}
                icon={getIconByType(stationConfig.type, isDeviceAbnormal)}
                ref={(ref) => { markerRefs.current[stationConfig.id] = ref; }}
                eventHandlers={{
                  click: () => {
                    handleLoadData(stationConfig);
                    bringMarkerToFront(stationConfig.id);
                  },
                }}
              >
                <Popup className="rounded-lg shadow-lg custom-popup-width">
                  <div className="p-1 sm:p-2">
                    <h3 className="font-bold text-base sm:text-lg mb-1">{stationConfig.name}</h3>
                    <button onClick={() => navigate(`/${routeGroup}/trend?deviceId=${stationConfig.id}`)} className="text-blue-600 underline mb-2 block text-xs sm:text-sm">查看詳細</button>
                    <hr className="my-1 sm:my-2" />
                    {latestData?.timestamp ? (
                      <div className="text-xs sm:text-sm space-y-0.5">
                        <p>時間：{new Date(latestData.timestamp).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>

                        {stationConfig.type === DEVICE_TYPES.RAIN && latestData.rainfall_10m !== undefined && latestData.rainfall_10m !== null && (
                          <p className="text-gray-700">
                            10分鐘雨量: {latestData.rainfall_10m.toFixed(1)} mm
                          </p>
                        )}

                        {stationConfig.type !== DEVICE_TYPES.RAIN && stationConfig.type !== DEVICE_TYPES.TDR && stationConfig.sensors?.map((sensor, sIdx) => (
                          sensor.channels.map((ch) => {
                            const chDataFromApi = latestData.channels?.[ch];
                            const displayValue = formatValue(stationConfig as unknown as Device, sensor, chDataFromApi, latestData);
                            return (
                              <p key={`${sIdx}-${ch}`} className="text-gray-700">
                                {sensor.name.replace(/\(.*\)/, '').trim()} ({ch.replace(/AI_|DI_/, '')}) : {displayValue}
                              </p>
                            );
                          })
                        ))}
                        {stationConfig.type === DEVICE_TYPES.TDR && <p className="text-gray-500 italic">TDR數據請查看詳細</p>}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-xs sm:text-sm">
                        {cached && 'error' in cached ? '數據加載失敗' : '載入中或無即時數據...'}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
      </div>
    </PageContainer>
  );
}

export default InteractiveMap;
