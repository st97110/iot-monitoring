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
    --primary: #0ea5e9;
    --primary-dark: #0369a1;
    --green: #10b981;
    --green-dark: #059669;
    --amber: #f59e0b;
    --red: #ef4444;
    --text: #0f172a;
    --text-light: #64748b;
    --text-muted: #94a3b8;
    --card-bg: #ffffff;
    --border: #e2e8f0;
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
    --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06);
    --shadow-lg: 0 10px 30px rgba(14, 165, 233, 0.18);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #dbeafe 100%);
    min-height: 100vh;
    color: var(--text);
    padding: 20px 16px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 920px; margin: 0 auto; }

  /* Header */
  .hdr { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .title-box { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 44px; height: 44px;
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    color: white;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
  }
  .logo svg { width: 26px; height: 26px; }
  h1 { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
  .sub { font-size: 13px; color: var(--text-light); margin-top: 2px; }

  /* Status pill */
  .status {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 999px;
    font-size: 14px; font-weight: 500;
    background: #d1fae5; color: #065f46;
    transition: all 0.3s ease;
  }
  .status.warn { background: #fef3c7; color: #92400e; }
  .status.bad  { background: #fee2e2; color: #991b1b; }
  .status.idle { background: #e2e8f0; color: #475569; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }

  /* Error banner */
  #error { color: #991b1b; background: #fee2e2; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; font-size: 14px; display: none; }
  #error.on { display: block; }

  /* Hero card */
  .hero {
    background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 60%, #38bdf8 100%);
    color: white;
    border-radius: 20px;
    padding: 28px 32px;
    margin-bottom: 16px;
    box-shadow: var(--shadow-lg);
    display: flex; align-items: center; gap: 36px;
    flex-wrap: wrap;
    position: relative;
    overflow: hidden;
    animation: slideIn 0.5s ease-out;
  }
  .hero::before {
    content: ''; position: absolute; top: -40px; right: -40px;
    width: 160px; height: 160px; border-radius: 50%;
    background: rgba(255,255,255,0.08);
    pointer-events: none;
  }
  @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .batt {
    flex-shrink: 0;
    position: relative;
    width: 92px; height: 160px;
  }
  .batt-body {
    width: 100%; height: 100%;
    border: 3px solid rgba(255,255,255,0.85);
    border-radius: 12px;
    position: relative;
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(4px);
    overflow: hidden;
  }
  .batt-body::before {
    content: ''; position: absolute;
    top: -10px; left: 50%; transform: translateX(-50%);
    width: 32px; height: 8px;
    background: rgba(255,255,255,0.85);
    border-radius: 3px 3px 0 0;
  }
  .batt-fill {
    position: absolute; left: 4px; right: 4px; bottom: 4px;
    height: 0%;
    background: linear-gradient(to top, #10b981, #34d399, #a7f3d0);
    border-radius: 6px;
    transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease;
  }
  .batt-fill.warn { background: linear-gradient(to top, #f59e0b, #fbbf24, #fde68a); }
  .batt-fill.bad  { background: linear-gradient(to top, #ef4444, #f87171, #fecaca); }
  .batt-pct {
    position: absolute;
    left: 0; right: 0;
    top: 50%; transform: translateY(-50%);
    text-align: center;
    font-size: 22px; font-weight: 800;
    color: rgba(255,255,255,0.95);
    text-shadow: 0 2px 4px rgba(0,0,0,0.18);
    pointer-events: none;
    z-index: 2;
  }

  .hero-main { flex: 1; min-width: 220px; position: relative; z-index: 1; }
  .hero-label { font-size: 16px; opacity: 0.88; margin-bottom: 8px; font-weight: 500; letter-spacing: 0.02em; }
  .hero-value { font-size: 68px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
  .hero-unit { font-size: 28px; font-weight: 500; opacity: 0.82; margin-left: 6px; }
  .hero-raw {
    margin-top: 14px; padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.2);
    font-size: 15px; opacity: 0.92;
    display: flex; gap: 6px; align-items: baseline;
  }
  .hero-raw-label { opacity: 0.75; }
  .hero-raw-value { font-weight: 600; }

  /* Chart card */
  .card {
    background: var(--card-bg);
    border-radius: 16px; padding: 20px 24px;
    box-shadow: var(--shadow-md);
    animation: slideIn 0.5s ease-out 0.1s both;
  }
  .card-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  .card-title { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .card-title svg { width: 18px; height: 18px; color: var(--primary); }
  .card-sub { font-size: 13px; color: var(--text-muted); }
  .chart-wrap { height: 320px; position: relative; }

  .foot { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 20px; padding-bottom: 8px; }
  .foot .dot-small { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; margin-right: 4px; vertical-align: middle; }

  /* Responsive */
  @media (max-width: 640px) {
    body { padding: 16px 12px; }
    .hero { padding: 24px; gap: 24px; }
    .hero-value { font-size: 54px; }
    .batt { width: 76px; height: 130px; }
    .batt-pct { font-size: 18px; }
    h1 { font-size: 20px; }
    .logo { width: 38px; height: 38px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="title-box">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <div>
        <h1 id="title">T2 電池電壓</h1>
        <div class="sub" id="updated">載入中…</div>
      </div>
    </div>
    <div class="status idle" id="status">
      <span class="dot"></span>
      <span id="status-text">讀取中</span>
    </div>
  </div>

  <div id="error"></div>

  <div class="hero">
    <div class="batt">
      <div class="batt-body">
        <div class="batt-fill" id="batt-fill"></div>
      </div>
      <div class="batt-pct" id="batt-pct">—</div>
    </div>
    <div class="hero-main">
      <div class="hero-label" id="hero-label">電池電壓</div>
      <div>
        <span class="hero-value" id="hero-value">—</span><span class="hero-unit" id="hero-unit">V</span>
      </div>
      <div class="hero-raw">
        <span class="hero-raw-label">原始訊號</span>
        <span class="hero-raw-value" id="hero-raw">— mA</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-hdr">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 17 9 11 13 15 21 7"/>
          <polyline points="14 7 21 7 21 14"/>
        </svg>
        24 小時走勢
      </div>
      <div class="card-sub">左軸 換算 V／右軸 原始 mA</div>
    </div>
    <div class="chart-wrap"><canvas id="chart"></canvas></div>
  </div>

  <div class="foot"><span class="dot-small"></span>每 30 秒自動更新</div>
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

function setStatus(cls, text) {
  const el = document.getElementById('status');
  el.className = 'status ' + cls;
  document.getElementById('status-text').textContent = text;
}

function ageText(iso) {
  if (!iso) return { cls: 'bad', text: '無資料' };
  const ageMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (ageMin > 60) return { cls: 'bad',  text: Math.round(ageMin) + ' 分鐘前' };
  if (ageMin > 20) return { cls: 'warn', text: Math.round(ageMin) + ' 分鐘前' };
  if (ageMin < 1)  return { cls: 'ok',   text: '即時' };
  return { cls: 'ok', text: Math.round(ageMin) + ' 分鐘前' };
}

function showError(msg) {
  const el = document.getElementById('error');
  if (msg) { el.textContent = '⚠ ' + msg; el.classList.add('on'); }
  else { el.classList.remove('on'); el.textContent = ''; }
}

async function refreshLatest() {
  try {
    const r = await fetch(API_LATEST, { cache: 'no-store' });
    if (!r.ok) throw new Error('伺服器回應 ' + r.status);
    const d = await r.json();
    showError(null);

    if (d.deviceName) document.getElementById('title').textContent = d.deviceName;
    document.getElementById('updated').textContent = '最近更新 ' + fmtTime(d.timestamp);

    const age = ageText(d.timestamp);
    setStatus(age.cls, age.text);

    const s = (d.sensors || [])[0];
    if (s) {
      document.getElementById('hero-label').textContent = s.name || '電池電壓';
      document.getElementById('hero-value').textContent = (s.value != null && isFinite(s.value)) ? s.value.toFixed(2) : '—';
      document.getElementById('hero-unit').textContent = s.unit || '';
      document.getElementById('hero-raw').textContent = (s.rawValue != null && isFinite(s.rawValue))
        ? s.rawValue.toFixed(2) + ' ' + (s.rawUnit || 'mA') : '— mA';

      // Battery fill based on scaleMin/scaleMax
      const fill = document.getElementById('batt-fill');
      const pctEl = document.getElementById('batt-pct');
      if (s.value != null && s.scaleMin != null && s.scaleMax != null && s.scaleMax > s.scaleMin) {
        let pct = ((s.value - s.scaleMin) / (s.scaleMax - s.scaleMin)) * 100;
        pct = Math.max(0, Math.min(100, pct));
        fill.style.height = pct + '%';
        fill.className = 'batt-fill' + (pct < 30 ? ' bad' : (pct < 55 ? ' warn' : ''));
        pctEl.textContent = pct.toFixed(0) + '%';
      } else {
        fill.style.height = '0%';
        pctEl.textContent = '—';
      }
    }
  } catch (e) {
    showError('讀取失敗：' + e.message);
    setStatus('bad', '連線失敗');
  }
}

let chart = null;
async function refreshHistory() {
  try {
    const r = await fetch(API_HISTORY + '?hours=24', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();

    const base = (d.series || []).find(s => (s.points || []).length > 0);
    if (!base) return;
    const labels = base.points.map(p => fmtHM(p.t));

    const COLORS = { converted: '#0ea5e9', raw: '#f59e0b' };
    const datasets = (d.series || []).map(s => {
      const color = COLORS[s.kind] || '#64748b';
      return {
        label: s.name + (s.unit ? ' (' + s.unit + ')' : ''),
        data: s.points.map(p => p.v),
        borderColor: color,
        backgroundColor: color + '20',
        fill: s.kind === 'converted',
        pointRadius: 0,
        pointHoverRadius: 4,
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
          legend: { position: 'bottom', labels: { font: { size: 13 }, padding: 14, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { backgroundColor: '#0f172a', titleFont: { weight: 600 }, padding: 10, borderColor: '#334155', borderWidth: 1, cornerRadius: 8 },
        },
      }
    });
  } catch (e) { /* 靜默 */ }
}

function tick() { refreshLatest(); refreshHistory(); }
tick();
setInterval(tick, 30000);
</script>
</body>
</html>
`;
