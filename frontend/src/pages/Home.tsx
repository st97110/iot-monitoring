import { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { API_BASE, deviceMapping, DEVICE_TYPE_NAMES, DEVICE_TYPES, Device, AreaConfig } from '../config/config';
import { getDeviceTypeColor, isNormalData, formatValue } from '../utils/sensor';
import type { LatestResponse, WiseLatestRecord } from '../types/api';

// ============ Helpers ============

function getRelativeTime(isoString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

type StatusTier = 'ok' | 'stale' | 'offline' | 'none';

function getStatusTier(timestamp: string | undefined): StatusTier {
  if (!timestamp) return 'none';
  const ageMin = (Date.now() - new Date(timestamp).getTime()) / 60000;
  if (ageMin > 24 * 60) return 'offline';
  if (ageMin > 75) return 'stale';
  return 'ok';  // 1 小時上傳週期，<=75 分鐘都算正常
}

const statusTone: Record<StatusTier, { bg: string; text: string; dot: string; label: (iso?: string) => string }> = {
  ok:      { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', label: iso => iso ? getRelativeTime(iso) : '—' },
  stale:   { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500',   label: iso => iso ? getRelativeTime(iso) : '—' },
  offline: { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     label: iso => iso ? getRelativeTime(iso) : '離線' },
  none:    { bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400',   label: () => '無資料' },
};

// ============ 站點照片對應 ============
const deviceImages: Record<string, string> = {
  'TDR_T14_T1': '/images/stations/t14/TDR_T14_T1.jpg',
  'TDR_T14_T2': '/images/stations/t14/TDR_T14_T2.jpg',
  'TDR_T14_AH3': '/images/stations/t14/TDR_T14_AH3.jpg',
  'WISE-4010LAN_74FE489299CB': '/images/stations/t14/WISE_W2_WATER.jpg',
  'WISE-4060LAN_00D0C9FD4D44': '/images/stations/t14/WISE_H2R_RAIN.jpg',
  'TDR_T14_T3': '/images/stations/t14/TDR_T14_T3.jpg',
  'TDR_T14_T4': '/images/stations/t14/TDR_T14_T4.jpg',
  'WISE-4010LAN_00D0C9FAD2C9_SITE1': '/images/stations/t14/WISE_14_25K_BT_TI.jpg',
  'WISE-4010LAN_00D0C9FAD2C9_SITE2': '/images/stations/t14/WISE_14_27K_BT_TI.jpg',
  'SN_6721': '/images/stations/t14/CH1_BT_TI.jpg',
  'WISE-4010LAN_74FE489299F4': '/images/stations/t14/WISE_BE1_GE.jpg',
  'WISE-4010LAN_74FE4890BAFC': '/images/stations/t14/WISE_BE2_GE.jpg',
  'TDR_T14A_CH1': '/images/stations/t14/TDR_T14A_CH1.jpg',
  'TDR_T14A_CH2': '/images/stations/t14/TDR_T14A_CH2.jpg',
  'TDR_T8_T1': '/images/stations/t8/TDR_T8_T1.jpg',
  'TDR_T8_T2': '/images/stations/t8/TDR_T8_T2.jpg',
  'TDR_T8_T4': '/images/stations/t8/TDR_T8_T4.jpg',
  'TDR_T8_T7': '/images/stations/t8/TDR_T8_T7.jpg',
  'TDR_T8_T8': '/images/stations/t8/TDR_T8_T8.jpg',
  'TDR_T8_T9': '/images/stations/t8/TDR_T8_T9.jpg',
  'WISE-4010LAN_74FE4860F492': '/images/stations/t8/WISE_OW10_WATER.jpg',
  'WISE-4010LAN_00D0C9FAD2C2': '/images/stations/t8/WISE_GE3_GE.jpg',
  'WISE-4010LAN_74FE48595E19': '/images/stations/t8/WISE_BT1_BT3_TI.jpg',
  'SN_6955': '/images/stations/t8/WISE_BT1_BT3_TI.jpg',
  'WISE-4010LAN_74FE486CEDFB': '/images/stations/t8/WISE_OW6_WATER.jpg',
  'WISE-4010LAN_74FE486B76BB': '/images/stations/t8/WISE_BT2_TI.jpg',
  'WISE-4010LAN_74FE488F3BA0': '/images/stations/t8/WISE_OW5_WATER.jpg',
  'WISE-4060LAN_00D0C9E332E8': '/images/stations/t8/WISE_107K_RAIN.jpg',
  'WISE-4010LAN_74FE486B76AA': '/images/stations/t8/WISE_OW1_GE1_MULTI.jpg',
  'WISE-4010LAN_74FE487F4FE3': '/images/stations/t8/WISE_FL_FLOW.jpg',
};

const defaultDeviceImages: Record<string, string> = {
  [DEVICE_TYPES.TI]: '/images/devices/TI.svg',
  [DEVICE_TYPES.WATER]: '/images/devices/WATER.svg',
  [DEVICE_TYPES.RAIN]: '/images/devices/RAIN.svg',
  [DEVICE_TYPES.GE]: '/images/devices/GE.svg',
  [DEVICE_TYPES.TDR]: '/images/devices/TDR.svg',
  [DEVICE_TYPES.FLOW]: '/images/devices/FLOW.svg',
  [DEVICE_TYPES.BATTERY]: '/images/devices/BATTERY.svg',
  't8_DEFAULT': '/images/devices/t8_default_station.png',
  't14_DEFAULT': '/images/devices/t14_default_station.png',
  'DEFAULT': '/images/devices/default_station.png',
};

function getDeviceImage(deviceConfig: Device): string {
  if (deviceImages[deviceConfig.id]) return deviceImages[deviceConfig.id];
  const type = deviceConfig.type;
  if (type && defaultDeviceImages[type]) return defaultDeviceImages[type];
  return defaultDeviceImages['DEFAULT'];
}

// 類型對應的簡短 badge 文字
const TYPE_BADGE: Partial<Record<DEVICE_TYPES, string>> = {
  [DEVICE_TYPES.TI]: 'TI',
  [DEVICE_TYPES.WATER]: 'W',
  [DEVICE_TYPES.RAIN]: 'R',
  [DEVICE_TYPES.GE]: 'GE',
  [DEVICE_TYPES.TDR]: 'TDR',
  [DEVICE_TYPES.FLOW]: 'FL',
};

// ============ Sub-components ============

function StatsStrip({ total, ok, stale, offline }: { total: number; ok: number; stale: number; offline: number }) {
  const Item = ({ dot, label, value }: { dot: string; label: string; value: number }) => (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-slate-500">{label}</span>
      <strong className="font-semibold">{value}</strong>
    </span>
  );
  return (
    <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm">
      <Item dot="bg-slate-500" label="總站點" value={total} />
      <span className="text-slate-200">·</span>
      <Item dot="bg-emerald-500" label="正常" value={ok} />
      <span className="text-slate-200">·</span>
      <Item dot="bg-amber-500" label="延遲" value={stale} />
      <span className="text-slate-200">·</span>
      <Item dot="bg-red-500" label="離線 / 無資料" value={offline} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex">
        <div className="w-24 h-24 bg-slate-200 animate-pulse" />
        <div className="flex-1 p-4 space-y-2">
          <div className="h-4 bg-slate-200 animate-pulse rounded w-2/3" />
          <div className="h-3 bg-slate-100 animate-pulse rounded w-1/3" />
          <div className="h-6 bg-slate-200 animate-pulse rounded w-1/2 mt-3" />
        </div>
      </div>
    </div>
  );
}

interface DeviceCardProps {
  device: Device;
  data: WiseLatestRecord | undefined;
  routeGroup: string | undefined;
}

function DeviceCard({ device, data, routeGroup }: DeviceCardProps) {
  const typeKey = device.type || DEVICE_TYPES.ALL;
  const gradient = getDeviceTypeColor(device);
  const isRainGauge = device.type === DEVICE_TYPES.RAIN;
  const isTdr = device.type === DEVICE_TYPES.TDR;

  const timestamp = data?.timestamp;
  const statusTier = getStatusTier(timestamp);

  const hasValid = !!(data && timestamp && !isNaN(new Date(timestamp).getTime()));
  const hasTdrData = isTdr ? !!((data as any)?.data && Array.isArray((data as any).data) && (data as any).data.length > 0) : true;
  const noData = !hasValid || !hasTdrData;

  const deviceLinkId = device.originalDeviceId || device.id;
  const trendLink = `/${routeGroup}/trend?deviceId=${deviceLinkId}${(isRainGauge || (device.sensors && device.sensors.length > 0)) ? '&sensorIndex=0' : ''}`;

  // 判斷整張卡片是否有異常值 → 邊框變紅
  let hasAbnormal = false;
  if (!noData && data && device.sensors) {
    if (isRainGauge) {
      const r24 = (data as any).rainfall_24h;
      if (r24 != null && !isNormalData(device, undefined, r24, 'rainfall_24h')) hasAbnormal = true;
    } else if (!isTdr) {
      for (const sensor of device.sensors) {
        for (const ch of sensor.channels) {
          const chData = data.channels?.[ch];
          if (!isNormalData(device, sensor, chData)) { hasAbnormal = true; break; }
        }
        if (hasAbnormal) break;
      }
    }
  }

  // 卡片整體樣式：異常時整片紅、粗邊；正常時中性底
  const cardBase = hasAbnormal
    ? 'bg-red-50 border-l-[6px] border-red-500 ring-1 ring-red-200'
    : 'bg-white border-l-4 border-slate-200';

  const statusToneInfo = statusTone[statusTier];

  return (
    <Link
      to={trendLink}
      className={`group flex rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${cardBase}`}
    >
      {/* 左側站點照片（固定小尺寸） */}
      <div className="w-24 shrink-0 relative bg-slate-100">
        <img
          src={getDeviceImage(device)}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            const fallback = defaultDeviceImages[(device.type as string) || 'DEFAULT'] || defaultDeviceImages.DEFAULT;
            if (img.src !== fallback) img.src = fallback;
            else img.style.display = 'none';
          }}
        />
        {/* 左上角類型徽章 */}
        <div className={`absolute top-1 left-1 inline-flex items-center justify-center w-10 h-5 bg-gradient-to-br ${gradient} text-white text-[10px] font-bold rounded`}>
          {TYPE_BADGE[typeKey] || typeKey}
        </div>
      </div>

      {/* 右側內容 */}
      <div className="flex-1 p-3 sm:p-4 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 break-all line-clamp-2" title={device.name}>
              {device.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{DEVICE_TYPE_NAMES[typeKey] || '設備'}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            {hasAbnormal && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white shadow-sm">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                異常
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusToneInfo.bg} ${statusToneInfo.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusToneInfo.dot}`}></span>
              {statusToneInfo.label(timestamp)}
            </span>
          </div>
        </div>

        {/* 數據區 */}
        <div className="flex-grow space-y-1.5 text-sm">
          {noData ? (
            <div className="text-slate-400 text-xs italic py-2">
              {data && (data as any).error ? `錯誤：${(data as any).error}` : '無即時數據'}
            </div>
          ) : isTdr ? (
            <div className="text-slate-500 text-xs italic py-1">TDR 資料請看趨勢圖</div>
          ) : isRainGauge ? (
            [
              { label: '1h', key: 'rainfall_1h' },
              { label: '3h', key: 'rainfall_3h' },
              { label: '24h', key: 'rainfall_24h' },
            ].map(item => {
              const value = (data as any)[item.key] as number | undefined | null;
              if (value == null) return null;
              const normal = isNormalData(device, undefined, value, item.key);
              return (
                <div key={item.key} className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-500">{item.label} 累積</span>
                  <span className={`${normal ? 'font-semibold text-slate-700' : 'font-bold text-red-600 text-lg leading-none'}`}>
                    {value.toFixed(1)} <span className="text-xs text-slate-400 font-normal">mm</span>
                  </span>
                </div>
              );
            })
          ) : (
            device.sensors?.flatMap((sensor, sIdx) =>
              (sensor.channels || []).map((ch) => {
                const chData = data.channels?.[ch];
                const displayValue = formatValue(device, sensor, chData, data);
                const normal = isNormalData(device, sensor, chData);
                return (
                  <div key={`${sIdx}-${ch}`} className="flex justify-between items-baseline gap-2">
                    <span className="text-xs text-slate-500 truncate">{sensor.name}</span>
                    <span className={`shrink-0 ${normal ? 'font-semibold text-slate-700' : 'font-bold text-red-600 text-lg leading-none'}`}>
                      {displayValue}
                    </span>
                  </div>
                );
              }),
            )
          )}
        </div>
      </div>
    </Link>
  );
}

// ============ Main ============

function Home() {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  const [latestData, setLatestData] = useState<LatestResponse>({});
  const [filterArea, setFilterArea] = useState<string>('全部');
  const [filterType, setFilterType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshedAt, setRefreshedAt] = useState<number>(Date.now());

  const fetchLatest = useCallback(() => {
    setLoading(true);
    axios.get<LatestResponse>(`${API_BASE}/api/latest`)
      .then(res => { setLatestData(res.data); setRefreshedAt(Date.now()); })
      .catch(err => console.error('取得最新資料失敗:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  // 每 60 秒自動重新整理（即時儀表板，錯過一次就過期）
  useEffect(() => {
    const id = setInterval(fetchLatest, 60_000);
    return () => clearInterval(id);
  }, [fetchLatest]);

  const relevantAreas = useMemo<[string, AreaConfig][]>(() => {
    if (!routeGroup) return [];
    return Object.entries(deviceMapping).filter(([, cfg]) => cfg.routeGroup === routeGroup);
  }, [routeGroup]);

  const allDevicesInRoute = useMemo<Device[]>(() => relevantAreas.flatMap(([, a]) => a.devices), [relevantAreas]);

  const areaNames = useMemo<string[]>(() => ['全部', ...relevantAreas.map(([, a]) => a.name)], [relevantAreas]);

  const typesInRoute = useMemo<DEVICE_TYPES[]>(() => {
    const set = new Set<DEVICE_TYPES>();
    allDevicesInRoute.forEach(d => { if (d.type) set.add(d.type); });
    return Array.from(set);
  }, [allDevicesInRoute]);

  // 同時符合 area / type / searchTerm 的裝置
  const filterDevice = useCallback((device: Device, areaName: string): boolean => {
    if (filterArea !== '全部' && areaName !== filterArea) return false;
    if (filterType && device.type !== filterType) return false;
    if (!searchTerm.trim()) return true;
    const kw = searchTerm.toLowerCase();
    return device.name.toLowerCase().includes(kw) ||
      !!device.id?.toLowerCase().includes(kw) ||
      !!device.originalDeviceId?.toLowerCase().includes(kw);
  }, [filterArea, filterType, searchTerm]);

  // 統計
  const stats = useMemo(() => {
    let total = 0, ok = 0, stale = 0, offline = 0;
    for (const dev of allDevicesInRoute) {
      total++;
      const phys = dev.originalDeviceId || dev.id;
      const data = latestData[phys];
      const tier = getStatusTier(data?.timestamp);
      if (tier === 'ok') ok++;
      else if (tier === 'offline' || tier === 'none') offline++;
      else stale++;
    }
    return { total, ok, stale, offline };
  }, [allDevicesInRoute, latestData]);

  const hasNoResults = useMemo(() =>
    !loading && relevantAreas.every(([, area]) => !area.devices.some(d => filterDevice(d, area.name))),
  [relevantAreas, filterDevice, loading]);

  return (
    <div className="min-h-[calc(100vh-200px)]">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              即時監測儀表板 {routeGroup === 't14' ? '· 台14線及甲線' : routeGroup === 't8' ? '· 台8線' : ''}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              最後更新：{new Date(refreshedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              <span className="ml-2 text-xs text-slate-400">（每 60 秒自動重載）</span>
            </p>
          </div>
          <button
            onClick={fetchLatest}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>
            </svg>
            重新整理
          </button>
        </div>

        {/* 統計條（精簡 inline） */}
        <StatsStrip total={stats.total} ok={stats.ok} stale={stats.stale} offline={stats.offline} />

        {/* 搜尋 + 篩選 */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3 shadow-sm">
          {/* 搜尋列 */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="搜尋站點名稱或 ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-300"
            />
          </div>

          {/* 區域 chip */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-medium text-slate-500 self-center mr-1">區域：</span>
            {areaNames.map(name => (
              <button
                key={name}
                onClick={() => setFilterArea(name)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  name === filterArea
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {/* 類型 chip */}
          {typesInRoute.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-medium text-slate-500 self-center mr-1">類型：</span>
              <button
                onClick={() => setFilterType('')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterType === ''
                    ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                全部
              </button>
              {typesInRoute.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t === filterType ? '' : t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    t === filterType
                      ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {DEVICE_TYPE_NAMES[t] || t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 載入中 */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* 無結果 */}
        {!loading && hasNoResults && (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <p className="text-slate-500">無符合條件的站點</p>
            <button
              onClick={() => { setSearchTerm(''); setFilterArea('全部'); setFilterType(''); }}
              className="mt-3 px-4 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              重設篩選條件
            </button>
          </div>
        )}

        {/* 各區域分組 */}
        {!loading && !hasNoResults && (
          <div className="space-y-6">
            {relevantAreas.map(([areaKey, areaConfig]) => {
              const visibleDevices = areaConfig.devices.filter(d => filterDevice(d, areaConfig.name));
              if (visibleDevices.length === 0) return null;
              return (
                <section key={areaKey}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{areaConfig.name}</h2>
                    <span className="text-xs text-slate-400">{visibleDevices.length} 個站點</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visibleDevices.map(device => {
                      const phys = device.originalDeviceId || device.id;
                      return (
                        <DeviceCard
                          key={device.id}
                          device={device}
                          data={latestData[phys]}
                          routeGroup={routeGroup}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
