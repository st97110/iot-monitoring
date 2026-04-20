import { Request, Response, NextFunction } from 'express';
import { formatInTimeZone } from 'date-fns-tz';
import { safeGetLatestData } from '../services/safeGetLatest';
import { safeGetHistoryData } from '../services/safeGetHistory';
import { getDeviceConfigById } from '../utils/helper';
import { logger } from '../utils/logger';

const BATTERY_DEVICE_ID = 'WISE-4010LAN_74FE48ADBD13';
const TIMEZONE = 'Asia/Taipei';

export async function getBatteryLatestJson(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cfg = getDeviceConfigById(BATTERY_DEVICE_ID);
    if (!cfg) {
      res.status(500).json({ error: `找不到設備設定: ${BATTERY_DEVICE_ID}` });
      return;
    }

    // 沿用 /api/latest 的路徑：safeGetLatestData -> getLatestDataFromDB -> queryLatestDataFromInflux
    // 回傳格式為 { [deviceId]: { timestamp, raw, channels } }
    const result = await safeGetLatestData('wise', BATTERY_DEVICE_ID);
    const record = result?.[BATTERY_DEVICE_ID] ?? null;

    const sensors = (cfg.sensors ?? []).map(s => {
      const ch = s.channels[0];
      const pegf = record?.raw?.[`${ch} PEgF`];  // 換算後（例：V）
      const egf  = record?.raw?.[`${ch} EgF`];   // 原始訊號（4–20 mA）
      return {
        name: s.name,
        channel: ch,
        unit: s.unit ?? '',
        value: typeof pegf === 'number' && isFinite(pegf) ? pegf : null,
        rawUnit: 'mA',
        rawValue: typeof egf === 'number' && isFinite(egf) ? egf : null,
        scaleMin: s.scaleMin ?? null,
        scaleMax: s.scaleMax ?? null,
      };
    });

    res.json({
      deviceId: BATTERY_DEVICE_ID,
      deviceName: cfg.name,
      timestamp: record?.timestamp ?? null,
      sensors,
    });
  } catch (err: any) {
    logger.error(`[battery] latest 失敗: ${err.message}`);
    next(err);
  }
}

export async function getBatteryHistoryJson(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours as string) || 24, 1), 168);
    const cfg = getDeviceConfigById(BATTERY_DEVICE_ID);
    if (!cfg) {
      res.status(500).json({ error: `找不到設備設定: ${BATTERY_DEVICE_ID}` });
      return;
    }

    // 沿用 /api/history 的 YYYY-MM-DD 本地日期字串格式（server TZ = Asia/Taipei）
    // safeGetHistoryData 會把日期當本地時區的 00:00 / 23:59:59 來查
    const now = new Date();
    const endDate = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
    const startDate = formatInTimeZone(new Date(now.getTime() - hours * 3600 * 1000), TIMEZONE, 'yyyy-MM-dd');

    const rows = await safeGetHistoryData('wise', BATTERY_DEVICE_ID, startDate, endDate, '10m');
    rows.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const cutoffMs = Date.now() - hours * 3600 * 1000;
    const inRange = rows.filter((r: any) => new Date(r.timestamp).getTime() >= cutoffMs);

    const pickPoints = (ch: string, metric: 'PEgF' | 'EgF') => inRange
      .map((r: any) => ({ t: r.timestamp, v: r.raw?.[`${ch} ${metric}`] }))
      .filter((p: any) => typeof p.v === 'number' && isFinite(p.v));

    const series = (cfg.sensors ?? []).flatMap(s => {
      const ch = s.channels[0];
      return [
        { name: `${s.name} (換算)`, unit: s.unit ?? '', channel: ch, kind: 'converted', points: pickPoints(ch, 'PEgF') },
        { name: `${s.name} (原始)`, unit: 'mA',          channel: ch, kind: 'raw',       points: pickPoints(ch, 'EgF')  },
      ];
    });

    res.json({ hours, series });
  } catch (err: any) {
    logger.error(`[battery] history 失敗: ${err.message}`);
    next(err);
  }
}

export function serveBatteryPage(_req: Request, res: Response): void {
  // 覆寫 helmet 的預設 CSP，允許 Chart.js CDN 和 inline script/style
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
  );
  res.type('html').send(PAGE_HTML);
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>T2 電池電壓監測</title>
<style>
  :root {
    --green: #10b981; --green-ink: #065f46; --green-bg1: #f0fdf4; --green-bg2: #dcfce7;
    --amber: #f59e0b; --amber-ink: #78350f; --amber-bg1: #fffbeb; --amber-bg2: #fef3c7;
    --red: #ef4444;   --red-ink:   #7f1d1d; --red-bg1:   #fef2f2; --red-bg2:   #fee2e2;
    --slate: #64748b; --slate-ink: #0f172a; --slate-bg1: #f8fafc; --slate-bg2: #e2e8f0;
    --text: #0f172a; --text-light: #475569; --text-muted: #94a3b8;
    --shadow-md: 0 4px 16px rgba(15, 23, 42, 0.08);
    --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.12);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
    min-height: 100vh; color: var(--text);
    padding: 20px 16px; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 920px; margin: 0 auto; }

  /* Header */
  .hdr { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .title-box { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 44px; height: 44px;
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center; color: white;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
  }
  .logo svg { width: 26px; height: 26px; }
  h1 { font-size: 26px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
  .sub { font-size: 15px; color: var(--text-light); margin-top: 3px; font-weight: 500; }

  /* 右上角精簡狀態（只在 ok 時顯示，其餘靠 hero 顏色 + banner） */
  .pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 999px;
    font-size: 14px; font-weight: 600;
    background: var(--green-bg2); color: var(--green-ink);
    transition: all 0.3s ease;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.15); } }

  /* 連線異常 / 無資料 的大型橫幅（狀態不是 ok 時才顯示） */
  .banner {
    display: none;
    align-items: center; gap: 12px;
    padding: 14px 18px; border-radius: 14px;
    margin-bottom: 14px;
    font-size: 17px; font-weight: 600;
    background: var(--amber-bg2); color: var(--amber-ink);
    border-left: 6px solid var(--amber);
  }
  .banner.on { display: flex; }
  .banner.bad { background: var(--red-bg2); color: var(--red-ink); border-left-color: var(--red); }
  .banner svg { flex-shrink: 0; width: 26px; height: 26px; }

  /* Hero card — 顏色跟著狀態走 */
  .hero {
    --hero-ink: var(--green-ink);
    --hero-stripe: var(--green);
    background: linear-gradient(135deg, var(--green-bg1) 0%, var(--green-bg2) 100%);
    color: var(--hero-ink);
    border-radius: 20px; padding: 30px 32px;
    margin-bottom: 16px;
    box-shadow: var(--shadow-lg);
    display: flex; align-items: center; gap: 36px;
    flex-wrap: wrap; position: relative; overflow: hidden;
    border-left: 8px solid var(--hero-stripe);
    animation: slideIn 0.5s ease-out;
    transition: background 0.4s ease, border-left-color 0.4s ease;
  }
  .hero.warn { --hero-ink: var(--amber-ink); --hero-stripe: var(--amber); background: linear-gradient(135deg, var(--amber-bg1) 0%, var(--amber-bg2) 100%); }
  .hero.bad  { --hero-ink: var(--red-ink);   --hero-stripe: var(--red);   background: linear-gradient(135deg, var(--red-bg1) 0%, var(--red-bg2) 100%); }
  .hero.idle { --hero-ink: var(--slate-ink); --hero-stripe: var(--slate); background: linear-gradient(135deg, var(--slate-bg1) 0%, var(--slate-bg2) 100%); }
  @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .batt { flex-shrink: 0; position: relative; width: 96px; height: 164px; }
  .batt-body {
    width: 100%; height: 100%;
    border: 3px solid currentColor;
    border-radius: 12px; position: relative;
    background: rgba(255,255,255,0.5);
    overflow: hidden;
  }
  .batt-body::before {
    content: ''; position: absolute;
    top: -10px; left: 50%; transform: translateX(-50%);
    width: 34px; height: 8px; background: currentColor;
    border-radius: 3px 3px 0 0;
  }
  .batt-fill {
    position: absolute; left: 4px; right: 4px; bottom: 4px; height: 0%;
    background: linear-gradient(to top, var(--green), #34d399);
    border-radius: 7px;
    transition: height 0.9s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease;
  }
  .batt-fill.warn { background: linear-gradient(to top, var(--amber), #fbbf24); }
  .batt-fill.bad  { background: linear-gradient(to top, var(--red),   #f87171); }

  .hero-main { flex: 1; min-width: 240px; position: relative; z-index: 1; }
  .status-big {
    display: inline-flex; align-items: center; gap: 12px;
    font-size: 42px; font-weight: 800; letter-spacing: -0.01em; line-height: 1;
    margin-bottom: 12px;
  }
  .status-big svg { width: 40px; height: 40px; flex-shrink: 0; }
  .hero-label { font-size: 14px; opacity: 0.75; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
  .hero-value-row { display: flex; align-items: baseline; gap: 8px; }
  .hero-value { font-size: 56px; font-weight: 800; line-height: 1; letter-spacing: -0.01em; }
  .hero-unit { font-size: 34px; font-weight: 700; opacity: 0.75; }
  .hero-raw {
    margin-top: 14px; padding-top: 12px;
    border-top: 1px solid currentColor;
    border-top-color: rgba(0,0,0,0.12);
    font-size: 14px; opacity: 0.7; font-weight: 500;
  }
  .hero-raw strong { font-weight: 700; opacity: 1.15; margin-left: 4px; }

  /* Chart card */
  .card {
    background: #ffffff;
    border-radius: 16px; padding: 20px 24px;
    box-shadow: var(--shadow-md);
    animation: slideIn 0.5s ease-out 0.1s both;
  }
  .card-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .card-title { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 8px; color: var(--text); }
  .card-title svg { width: 18px; height: 18px; color: #0ea5e9; }
  .card-sub { font-size: 13px; color: var(--text-muted); }
  .chart-wrap { height: 340px; position: relative; }

  .foot { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 20px; padding-bottom: 8px; }
  .foot-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; margin-right: 4px; vertical-align: middle; transition: background 0.3s ease; }
  .foot-dot.warn { background: var(--amber); }
  .foot-dot.bad  { background: var(--red);   }
  .foot-dot.idle { background: var(--slate); }

  /* Responsive */
  @media (max-width: 640px) {
    body { padding: 16px 12px; }
    .hero { padding: 24px; gap: 22px; }
    .status-big { font-size: 32px; }
    .status-big svg { width: 32px; height: 32px; }
    .hero-value { font-size: 44px; }
    .hero-unit { font-size: 26px; }
    .batt { width: 80px; height: 134px; }
    h1 { font-size: 22px; }
    .logo { width: 40px; height: 40px; }
    .banner { font-size: 15px; padding: 12px 14px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="title-box">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      </div>
      <div>
        <h1 id="title">T2 電池電壓</h1>
        <div class="sub" id="updated">載入中…</div>
      </div>
    </div>
    <div class="pill" id="pill">
      <span class="dot"></span><span id="pill-text">讀取中</span>
    </div>
  </div>

  <div class="banner" id="banner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span id="banner-text"></span>
  </div>

  <div class="hero" id="hero">
    <div class="batt">
      <div class="batt-body">
        <div class="batt-fill" id="batt-fill"></div>
      </div>
    </div>
    <div class="hero-main">
      <div class="status-big" id="status-big">
        <svg id="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
        </svg>
        <span id="status-word">—</span>
      </div>
      <div class="hero-label" id="hero-label">電池電壓</div>
      <div class="hero-value-row">
        <span class="hero-value" id="hero-value">—</span><span class="hero-unit" id="hero-unit">V</span>
      </div>
      <div class="hero-raw">原始訊號<strong id="hero-raw">— mA</strong></div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>
        </svg>
        24 小時走勢
      </div>
      <div class="card-sub">左軸 換算 V／右軸 原始 mA</div>
    </div>
    <div class="chart-wrap"><canvas id="chart"></canvas></div>
  </div>

  <div class="foot"><span class="foot-dot" id="foot-dot"></span>每 30 秒自動更新</div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
const BASE = location.pathname.replace(/\\/+$/, '');
const API_LATEST = BASE + '/latest';
const API_HISTORY = BASE + '/history';

const pad = n => String(n).padStart(2, '0');
const fmtTime = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};
const fmtHM = iso => { if (!iso) return ''; const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

// SVG icons for status
const ICON_OK   = '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>';
const ICON_WARN = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const ICON_BAD  = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
const ICON_IDLE = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';

function applyStatus(cls, word, pillText, bannerMsg) {
  // Hero + pill + foot-dot 統一吃同一個狀態 class
  document.getElementById('hero').className = 'hero ' + cls;
  document.getElementById('pill').className = 'pill ' + (cls === 'ok' ? '' : cls);
  document.getElementById('foot-dot').className = 'foot-dot ' + (cls === 'ok' ? '' : cls);
  document.getElementById('pill-text').textContent = pillText;
  document.getElementById('status-word').textContent = word;

  const icon = document.getElementById('status-icon');
  icon.innerHTML = cls === 'ok' ? ICON_OK : cls === 'warn' ? ICON_WARN : cls === 'bad' ? ICON_BAD : ICON_IDLE;

  // Pill 背景色（非 ok 時）
  const pill = document.getElementById('pill');
  if (cls === 'warn') { pill.style.background = 'var(--amber-bg2)'; pill.style.color = 'var(--amber-ink)'; }
  else if (cls === 'bad') { pill.style.background = 'var(--red-bg2)'; pill.style.color = 'var(--red-ink)'; }
  else if (cls === 'idle') { pill.style.background = 'var(--slate-bg2)'; pill.style.color = 'var(--slate-ink)'; }
  else { pill.style.background = ''; pill.style.color = ''; }

  // Banner (僅非 ok 時顯示)
  const banner = document.getElementById('banner');
  if (bannerMsg) {
    banner.className = 'banner on' + (cls === 'bad' ? ' bad' : '');
    document.getElementById('banner-text').textContent = bannerMsg;
  } else {
    banner.className = 'banner';
  }
}

// WISE 預設每小時上傳一次，所以 <75 分都算正常，超過 2.5 小時才算連線中斷
const STALE_WARN_MIN = 75;
const STALE_BAD_MIN  = 150;

// 狀態判定：時間新鮮度 + 電量百分比，取較差那個
function computeStatus(iso, pct) {
  let staleCls = 'ok', staleText = '正常', staleBanner = null;
  if (!iso) { staleCls = 'bad'; staleText = '無資料'; staleBanner = '目前沒有接收到任何資料'; }
  else {
    const ageMin = (Date.now() - new Date(iso).getTime()) / 60000;
    if (ageMin > STALE_BAD_MIN)       { staleCls = 'bad';  staleText = Math.round(ageMin) + ' 分鐘未更新'; staleBanner = '已超過 ' + Math.round(STALE_BAD_MIN/60 * 10)/10 + ' 小時沒有新資料，可能連線中斷'; }
    else if (ageMin > STALE_WARN_MIN) { staleCls = 'warn'; staleText = Math.round(ageMin) + ' 分鐘前'; staleBanner = '資料更新延遲中'; }
    else if (ageMin < 1)              { staleCls = 'ok';   staleText = '剛剛'; }
    else                              { staleCls = 'ok';   staleText = Math.round(ageMin) + ' 分鐘前'; }
  }

  let chargeCls = 'ok', chargeWord = '電力正常', chargeBanner = null;
  if (pct == null) { chargeCls = 'idle'; chargeWord = '等待資料'; }
  else if (pct < 30) { chargeCls = 'bad';  chargeWord = '電力不足'; chargeBanner = '電池電量偏低，請儘速檢查'; }
  else if (pct < 55) { chargeCls = 'warn'; chargeWord = '電力偏低'; chargeBanner = '電池電量偏低，建議關注'; }

  // 取較嚴重的
  const sev = { ok: 0, idle: 1, warn: 2, bad: 3 };
  const worse = sev[staleCls] >= sev[chargeCls] ? staleCls : chargeCls;
  // 連線異常時狀態字顯示「連線中斷/延遲更新」
  const word = (staleCls === 'bad' || staleCls === 'warn') && sev[staleCls] > sev[chargeCls]
    ? (staleCls === 'bad' ? '連線中斷' : '延遲更新')
    : chargeWord;
  const banner = sev[staleCls] >= sev[chargeCls] ? staleBanner : chargeBanner;

  return { cls: worse, word, pillText: staleText, banner };
}

async function refreshLatest() {
  try {
    const r = await fetch(API_LATEST, { cache: 'no-store' });
    if (!r.ok) throw new Error('伺服器回應 ' + r.status);
    const d = await r.json();

    if (d.deviceName) document.getElementById('title').textContent = d.deviceName;
    document.getElementById('updated').textContent = '最近更新 ' + fmtTime(d.timestamp);

    const s = (d.sensors || [])[0];
    let pct = null;
    if (s) {
      document.getElementById('hero-label').textContent = s.name || '電池電壓';
      document.getElementById('hero-value').textContent = (s.value != null && isFinite(s.value)) ? s.value.toFixed(2) : '—';
      document.getElementById('hero-unit').textContent = s.unit || '';
      document.getElementById('hero-raw').textContent = (s.rawValue != null && isFinite(s.rawValue))
        ? s.rawValue.toFixed(2) + ' ' + (s.rawUnit || 'mA') : '— mA';

      const fill = document.getElementById('batt-fill');
      if (s.value != null && s.scaleMin != null && s.scaleMax != null && s.scaleMax > s.scaleMin) {
        pct = Math.max(0, Math.min(100, ((s.value - s.scaleMin) / (s.scaleMax - s.scaleMin)) * 100));
        fill.style.height = pct + '%';
        fill.className = 'batt-fill' + (pct < 30 ? ' bad' : (pct < 55 ? ' warn' : ''));
      } else {
        fill.style.height = '0%';
        fill.className = 'batt-fill';
      }
    }

    const st = computeStatus(d.timestamp, pct);
    applyStatus(st.cls, st.word, st.pillText, st.banner);
  } catch (e) {
    applyStatus('bad', '連線失敗', '錯誤', '無法連線到伺服器，請稍後重新整理頁面');
  }
}

let chart = null;
async function refreshHistory() {
  try {
    const r = await fetch(API_HISTORY + '?hours=24', { cache: 'no-store' });
    if (!r.ok) { console.warn('[battery] history HTTP', r.status); return; }
    const d = await r.json();

    const series = d.series || [];
    const base = series.find(s => (s.points || []).length > 0);
    const totalPoints = series.reduce((n, s) => n + ((s.points || []).length), 0);

    const wrap = document.querySelector('.chart-wrap');
    let empty = document.getElementById('chart-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'chart-empty';
      empty.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:15px;';
      wrap.appendChild(empty);
    }

    if (!base) {
      empty.textContent = '尚未有 24 小時內的紀錄';
      empty.style.display = 'flex';
      if (chart) { chart.destroy(); chart = null; }
      return;
    }
    empty.style.display = 'none';

    const labels = base.points.map(p => fmtHM(p.t));
    // 點少的時候要顯示圓點（否則 line chart 看不到）
    const pointRadius = totalPoints <= 20 ? 4 : 0;

    const COLORS = { converted: '#0ea5e9', raw: '#f59e0b' };
    const datasets = series.map(s => {
      const color = COLORS[s.kind] || '#64748b';
      return {
        label: s.name + (s.unit ? ' (' + s.unit + ')' : ''),
        data: s.points.map(p => p.v),
        borderColor: color,
        backgroundColor: color + '33',
        fill: s.kind === 'converted',
        pointRadius,
        pointHoverRadius: Math.max(pointRadius + 2, 5),
        pointBackgroundColor: color,
        borderWidth: 2.5,
        tension: 0.35,
        spanGaps: true,
        yAxisID: s.kind === 'raw' ? 'yRaw' : 'y',
      };
    });

    const ctx = document.getElementById('chart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 8, autoSkip: true, color: '#64748b' }, grid: { color: '#f1f5f9' } },
          y:    { position: 'left',  title: { display: true, text: '換算 (V)',  color: '#0ea5e9', font: { weight: 600 } }, ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } },
          yRaw: { position: 'right', title: { display: true, text: '原始 (mA)', color: '#f59e0b', font: { weight: 600 } }, ticks: { color: '#64748b' }, grid: { drawOnChartArea: false } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 14 }, padding: 14, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { backgroundColor: '#0f172a', titleColor: '#f1f5f9', bodyColor: '#e2e8f0', titleFont: { weight: 600 }, padding: 10, borderColor: '#334155', borderWidth: 1, cornerRadius: 8 },
        },
      }
    });
  } catch (e) {
    console.error('[battery] history error:', e);
  }
}

function tick() { refreshLatest(); refreshHistory(); }
tick();
setInterval(tick, 30000);
</script>
</body>
</html>
`;
