import { Request, Response, NextFunction } from 'express';
import { queryLatestDataFromInflux, queryHistoryDataFromInflux } from '../services/influxClientService';
import { getDeviceConfigById } from '../utils/helper';
import { logger } from '../utils/logger';

const BATTERY_DEVICE_ID = 'WISE-4010LAN_74FE48ADBD13';

export async function getBatteryLatestJson(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cfg = getDeviceConfigById(BATTERY_DEVICE_ID);
    if (!cfg) {
      res.status(500).json({ error: `找不到設備設定: ${BATTERY_DEVICE_ID}` });
      return;
    }

    const raw = await queryLatestDataFromInflux('wise', BATTERY_DEVICE_ID);

    const sensors = (cfg.sensors ?? []).map(s => {
      const ch = s.channels[0];
      const pegf = raw?.raw?.[`${ch} PEgF`];  // 換算後（例：V）
      const egf  = raw?.raw?.[`${ch} EgF`];   // 原始訊號（4–20 mA）
      return {
        name: s.name,
        channel: ch,
        unit: s.unit ?? '',
        value: typeof pegf === 'number' && isFinite(pegf) ? pegf : null,
        rawUnit: 'mA',
        rawValue: typeof egf === 'number' && isFinite(egf) ? egf : null,
      };
    });

    res.json({
      deviceId: BATTERY_DEVICE_ID,
      deviceName: cfg.name,
      timestamp: raw?.timestamp ?? null,
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

    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - hours * 3600 * 1000).toISOString().slice(0, 10);

    const rows = await queryHistoryDataFromInflux('wise', BATTERY_DEVICE_ID, startDate, endDate);
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
<title>80K 太陽能電池監測</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; background: #f4f5f7; color: #1b1f23; padding: 16px; }
  h1 { font-size: 26px; margin: 0 0 4px 0; }
  .updated { color: #606770; font-size: 15px; margin-bottom: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: #fff; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .card-label { font-size: 17px; color: #606770; margin-bottom: 6px; }
  .card-value { font-size: 40px; font-weight: 700; line-height: 1.1; }
  .card-unit { font-size: 20px; color: #606770; margin-left: 6px; font-weight: 400; }
  .card-raw { font-size: 15px; color: #909090; margin-top: 10px; border-top: 1px solid #eee; padding-top: 8px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 14px; margin-left: 8px; }
  .ok { background: #d4edda; color: #155724; }
  .warn { background: #fff3cd; color: #856404; }
  .bad { background: #f8d7da; color: #721c24; }
  #error { color: #b00; margin-bottom: 10px; min-height: 20px; }
  #chart-wrap { background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  #chart { width: 100%; height: 300px; }
  .foot { color: #909090; font-size: 12px; text-align: right; margin-top: 12px; }
</style>
</head>
<body>
<h1 id="title">80K 太陽能電池監測</h1>
<div class="updated" id="updated">載入中…</div>
<div id="error"></div>
<div class="cards" id="cards"></div>
<div id="chart-wrap"><canvas id="chart"></canvas></div>
<div class="foot">每 30 秒自動更新</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
const API_LATEST = './latest';
const API_HISTORY = './history';

function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtVal(v, unit) {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(2) + ' <span class="card-unit">' + (unit || '') + '</span>';
}
function ageBadge(iso) {
  if (!iso) return '<span class="badge bad">無資料</span>';
  const ageMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (ageMin > 60) return '<span class="badge bad">' + ageMin.toFixed(0) + ' 分鐘前</span>';
  if (ageMin > 20) return '<span class="badge warn">' + ageMin.toFixed(0) + ' 分鐘前</span>';
  return '<span class="badge ok">' + ageMin.toFixed(0) + ' 分鐘前</span>';
}

async function refreshLatest() {
  try {
    const r = await fetch(API_LATEST, { cache: 'no-store' });
    if (!r.ok) throw new Error('伺服器回應 ' + r.status);
    const d = await r.json();
    document.getElementById('title').textContent = d.deviceName || '電池監測';
    document.getElementById('updated').innerHTML = '最近更新：' + fmtTime(d.timestamp) + ageBadge(d.timestamp);
    document.getElementById('error').textContent = '';
    const html = (d.sensors || []).map(s => (
      '<div class="card">' +
        '<div class="card-label">' + s.name + '</div>' +
        '<div class="card-value">' + fmtVal(s.value, s.unit) + '</div>' +
        '<div class="card-raw">原始訊號：' + fmtVal(s.rawValue, s.rawUnit) + '</div>' +
      '</div>'
    )).join('');
    document.getElementById('cards').innerHTML = html || '<div class="card">尚無資料</div>';
  } catch (e) {
    document.getElementById('error').textContent = '讀取失敗：' + e.message;
  }
}

let chart = null;
const COLORS = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd'];

async function refreshHistory() {
  try {
    const r = await fetch(API_HISTORY + '?hours=24', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();

    const base = (d.series || []).find(s => (s.points || []).length > 0);
    if (!base) return;
    const labels = base.points.map(p => fmtHM(p.t));
    const datasets = (d.series || []).map((s, i) => ({
      label: s.name + (s.unit ? ' (' + s.unit + ')' : ''),
      data: s.points.map(p => p.v),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.2,
      spanGaps: true,
      yAxisID: s.kind === 'raw' ? 'yRaw' : 'y',
    }));

    const ctx = document.getElementById('chart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
          y:    { position: 'left',  title: { display: true, text: '換算 (V)' } },
          yRaw: { position: 'right', title: { display: true, text: '原始 (mA)' }, grid: { drawOnChartArea: false } },
        },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 13 } } } },
      }
    });
  } catch (e) { /* 靜默 */ }
}

function tick() {
  refreshLatest();
  refreshHistory();
}
tick();
setInterval(tick, 30000);
</script>
</body>
</html>
`;
