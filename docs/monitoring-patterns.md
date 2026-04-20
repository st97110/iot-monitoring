---
name: monitoring-dashboard-patterns
description: 可重複使用的 IoT 環境監測儀表板設計模式 — 涵蓋後端資料管線、裝置抽象、前端視覺化、私有內部頁面、CI/CD 等。適用於有多種感測器、4-20mA 類比訊號、InfluxDB 時序資料庫、React 前端的監測專案。
when_to_use: |
  接到新的監測專案時，或想把這個專案（monitoring-deploy）的模式套到其他站點 / 不同客戶時，讀一遍這份 skill。
  它不是「照抄」指南，而是告訴你每個決策背後為什麼這樣設計、踩過哪些坑。
---

# Monitoring Dashboard Patterns

這份文件把 monitoring-deploy 專案累積的架構決策、設計模式、踩坑紀錄整理成可重用 reference。
適用場景：多感測器、4-20mA 類比 + 數位訊號、定期上傳 CSV/JSON、InfluxDB 存、Web 看。

---

## 目錄

> **遇到問題直接跳 §11 踩坑紀錄**（這是最常查的一節，有症狀索引表）。
> 學設計模式才從 §1 往下讀。

1. [整體架構](#1-整體架構)
2. [裝置抽象模型](#2-裝置抽象模型) — DEVICE_TYPES / Sensor / 虛擬 ID / rawToPEgF / 雨量差值
3. [資料管線](#3-資料管線) — 上傳 → scan → InfluxDB；DB fallback；時區
4. [前後端共用 Config](#4-前後端共用-config) — shared/ 結構、rootDir=".."、Docker context、internal 過濾
5. [前端儀表板模式](#5-前端儀表板模式) — Glance-ability、status tier、skeleton、preset、CSV、排序
6. [圖表模式](#6-圖表模式) — ComposedChart / **§6.2 多裝置疊圖（時間軸錯開）** / single-point / Brush
7. [私有內部頁面](#7-私有內部頁面) — Path obscurity、CSP override、self-contained、非技術使用者 UX
8. [CI / CD / Docker](#8-ci--cd--docker) — lockfile、layer caching、build context
9. [設計系統](#9-設計系統) — type 色 vs status 色、SVG icon、Card 排版
10. [Design Review 工作流](#10-design-review-工作流)
11. [常見坑與修法](#11-常見坑與修法) — **含症狀索引表，先看這**
12. [Appendix：專案起步 checklist](#appendix-專案快速起步檢查清單)

---

## 1. 整體架構

```
┌──────────────┐   POST      ┌──────────┐   cron 10m    ┌──────────┐
│ Field Device │ ──────────▶ │ Backend  │ ────────────▶ │ InfluxDB │
│ (WISE / TDR) │  /upload_log│ (Node TS)│  scan + write │          │
└──────────────┘             └──────────┘               └──────────┘
                              ▲      │                      ▲
                              │      │ Flux query           │
                      GET     │      └──────────────────────┘
                      /api/*  │
                              │
                        ┌──────────┐
                        │ Frontend │
                        │ (React)  │
                        └──────────┘
```

前端**只**透過 backend 的 `/api/*` 拿資料，不直接連 InfluxDB（token 不外流、統一邏輯）。

- **Backend**：Node 20 + Express + TypeScript + `@influxdata/influxdb-client` + `node-cron` + `fs-extra` + `csv-parser` + `winston`
- **Frontend**：React 18 + Vite + Tailwind + Recharts + Leaflet + axios
- **Shared**：repo 根目錄的 `shared/` 資料夾，前後端都 import（single source of truth）

**關鍵設計**：前端不直接碰 InfluxDB，全部透過 backend `/api/*`。
一個原因是 InfluxDB token 不想外流，另一個是 backend 已經做了複雜的設備邏輯（虛擬 ID、ETI 映射、雨量差值計算）。

---

## 2. 裝置抽象模型

### 2.1 DEVICE_TYPES enum

```ts
export enum DEVICE_TYPES {
  ALL = '',          // UI filter sentinel（"全部類型"），不是實際 device type
  TI = 'TI',         // 傾斜儀 (Tiltmeter)
  WATER = 'WATER',   // 水位計
  RAIN = 'RAIN',     // 雨量筒
  GE = 'GE',         // 伸縮計 (Extensometer)
  TDR = 'TDR',       // Time Domain Reflectometer
  FLOW = 'FLOW',     // 流量計
  BATTERY = 'BATTERY', // 太陽能+電池監測
}
```

加新類型的時候：
1. 加 enum 值
2. `utils/helper.ts` 的 `rawToPEgF` 加 case（定義原始 mA 怎麼轉工程值）
3. `sensor.ts` (frontend) 的 `formatValue` 加顯示格式
4. `sensor.ts` 的 `isNormalData` 加閾值判斷（可選）
5. UI 配色（type color、icon）

### 2.2 Sensor interface

```ts
interface Sensor {
  name: string;                                // 顯示名（"A軸"）
  channels: string[];                          // 對應 WISE 的 AI_0、AI_1、DI_0
  type: DEVICE_TYPES;
  initialValues?: Record<string, number>;      // 計算 Delta 用（"AI_0 mA 初始值"）
  sourceChannelMapping?: Record<string, string>; // 準星 ETI：AI_0 ↔ 資料庫 channel tag

  // Type-specific 量程參數
  wellDepth?: number;      // WATER
  fsDeg?: number;          // TI（±FS°，15/30/10）
  geRange?: number;        // GE (cm)
  flowMax?: number;        // FLOW (m³/h)
  scaleMin?: number;       // BATTERY（4mA 對應值）
  scaleMax?: number;       // BATTERY（20mA 對應值）
  unit?: string;           // BATTERY 顯示單位（V/A/%）
}
```

### 2.3 虛擬裝置 ID 模式

問題：一台 WISE 有 4 個 AI channel，但可能代表多個「站點」（例如 OW1 水位計 + GE1 伸縮計裝在同一台）。
前端地圖要分開顯示各站點、各自 lat/lng，但 backend 掃描資料時看到的只有實體 MAC。

解法：虛擬 ID + `originalDeviceId`：

```ts
// 一台實體 WISE、兩個虛擬站點
{ id: 'WISE-xxx_OW1', originalDeviceId: 'WISE-xxx', lat: ..., sensors: [OW1 sensor] }
{ id: 'WISE-xxx_GE1', originalDeviceId: 'WISE-xxx', lat: ..., sensors: [GE1 sensor] }
```

Backend helper 要同時支援用實體 ID 或虛擬 ID 查裝置：

```ts
const byExactId = new Map<string, Device>();
const byPhysicalId = new Map<string, Device[]>();

function findDevices(id: string): Device[] {
  if (byExactId.has(id)) return [byExactId.get(id)!];
  return byPhysicalId.get(id) ?? [];  // 實體 ID 可能對應多個虛擬
}

// Scanner 拿到實體 MAC 時，getSensorsByDeviceId 要合併所有虛擬裝置的 sensors
function getSensorsByDeviceId(id: string): Sensor[] | undefined {
  const devs = findDevices(id);
  return devs.flatMap(d => d.sensors ?? []);
}
```

### 2.4 rawToPEgF 工程值換算

4-20mA 是業界標準類比訊號。為什麼分母是 `16`：信號全擺幅 20-4=16mA。
TI 為什麼分母是 `2*fsDeg`：4mA→-fs、12mA→0、20mA→+fs，全擺幅是 2·fsDeg。

```ts
switch (type) {
  case DEVICE_TYPES.WATER:   // mA → 地下水位 (m)
    ratio = (raw - 4) / 16;
    return ratio * wellDepth;

  case DEVICE_TYPES.TI:      // mA → arc-sec（傾斜量）
    // 4mA=-fs°、12mA=0°、20mA=+fs°；全擺幅 2·fsDeg°
    deg = ((raw - 12) / 16) * (2 * fsDeg);
    return deg * 3600;        // 度 → 角秒

  case DEVICE_TYPES.GE:      // mA → cm
    return (raw - 4) / 16 * geRange;

  case DEVICE_TYPES.BATTERY: // 泛用線性 scaleMin ~ scaleMax
    return scaleMin + (raw - 4) / 16 * (scaleMax - scaleMin);

  case DEVICE_TYPES.FLOW:    // mA → m³/h
    return (raw - 4) / 16 * flowMax;

  case DEVICE_TYPES.RAIN:    // 雨量筒用差值另算，不走線性
  default:
    return raw;
}
```

**⚠ 技術債警告**：前端 `sensor.ts` 和 backend `helper.ts` 各有一份 rawToPEgF。
現況不一致會造成真實 bug：

| 值 | 存在哪 | 誰算的 | 有減 initial（Delta）？ |
|---|---|---|---|
| 原始 mA (`AI_0 EgF`) | InfluxDB | WISE 模組直接輸出 | ❌ |
| 工程值 (`AI_0 PEgF`) | InfluxDB | Backend 寫入時算 | ❌（只轉 mA→度） |
| 頁面顯示值 | - | **Frontend 自己重算** | ✅（TI/GE 會減 `initialValues[ch]` 得 Delta） |

換句話說：**使用者看到的是前端算的 Delta**，後端寫進 DB 的 PEgF 只是轉 mA 成度／公分、沒扣初始。
CSV 匯出時拿到的原始值 + 顯示值都經過前端算，合理。
但如果有第三方 BI 直接查 InfluxDB，拿到的 PEgF 不是 Delta，會跟前端對不上。

**建議做法**：下次重構時把 rawToPEgF 搬到 `shared/`，前後端呼叫同一個；initial 扣除另外包 `toDelta(peg, initial)`。目前尚未做。

### 2.5 Rain gauge 雨量差值計算

雨量筒是「累積計數 cnt」，每次翻斗 +1（通常每斗 = 0.5mm）。
要算「10 分鐘雨量」必須用**兩次採樣差值**：

```ts
const delta = currentCount >= lastCount
  ? (currentCount - lastCount)
  : currentCount;  // 翻過零則用當前值
const rainMm = delta / 2.0;  // 每 cnt = 0.5mm
```

狀態要持久化（`rainGaugeState.json`），不然重啟就丟失 lastCount 無法算下次的差值。

---

## 3. 資料管線

### 3.1 上傳流程

```
WISE/TDR 儀器
  ↓ POST /upload_log/<MAC>/signal_log/<date>/<file.csv>
Backend Express
  ↓ uploadWiseLog → saveFile → 自動建 <wise_data>/<MAC>/signal_log/<date>/ 目錄
wise_data/ 資料夾（原始檔）
  ↓ dataScanScheduler 每 10 分鐘
scannerService
  ├─ 讀所有 <MAC> 資料夾
  ├─ parseWiseCSVFile
  ├─ convertWiseToInfluxPoints（套 toPEgF 得工程值）
  ├─ writeWiseDataToInflux
  └─ moveFileAfterWrite → wise_backup_data/（保留備份）
```

**為什麼 scan 不即時？**
上傳是 push model，scan 是 pull model。scan 有重試、批次寫入、錯誤容錯、資料夾清理的好處；即時處理每一筆反而複雜。

**陷阱 1**：`convertWiseToInfluxPoints` 會用 `getSensorsByDeviceId` 過濾 channel。
如果 config 沒登記某 MAC，掃到的檔案會被「處理過」移到備份但 DB 沒寫入 → **資料遺失**。
所以新增設備的 config 要**在對應 MAC 開始上傳前**就加進 config.ts。

**陷阱 2**：檔案移去 backup 後就不會重新處理，就算之後加了 config 也來不及。
如果你事後才加 config，新資料會進 DB，但**錯過的那段資料只能從 backup 手動灌回**。

### 3.2 DB → 資料夾 fallback

`safeGetLatestData` / `safeGetHistoryData` 做一層 fallback：

```ts
try {
  const dbResult = await getLatestDataFromDB(source, deviceId);
  if (Object.keys(dbResult).length > 0) return dbResult;
  return await getLatestDataFromFolder(source, deviceId);
} catch {
  return await getLatestDataFromFolder(source, deviceId);
}
```

好處：InfluxDB 掛掉時，至少還能從 CSV 讀最新資料。

### 3.3 時區一致性

- **伺服器 TZ = Asia/Taipei**（`server.ts` 第一行 `process.env.TZ = 'Asia/Taipei'`）
- **InfluxDB 存 UTC**
- **API 輸入：前端傳 `YYYY-MM-DD` 當地日期字串**
- **InfluxDB 查：用 `date-fns-tz.formatInTimeZone` 把「台灣 2026-04-20 00:00」→ UTC ISO**

前端處理自己轉當地顯示即可（`new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', ... })`）。

**陷阱**：如果前端跨時區傳 `new Date().toISOString().slice(0,10)`，台灣早上 8 點前會拿到「昨天」日期。
用 `formatInTimeZone(now, 'Asia/Taipei', 'yyyy-MM-dd')` 才保證取到台灣當天。

---

## 4. 前後端共用 Config

### 4.1 為什麼需要共用

前後端各自維護 deviceMapping 會出現的問題：
- 同一台 BT1，後端 `fsDeg: 15`、前端 `fsDeg: 10` → backend 算出的 PEgF 錯
- 前端拆虛擬裝置（SITE1/SITE2），後端沒拆 → scanner 只看到半數 channel
- 新加的 BATTERY 只在後端有，前端顯示不出來

**Single source of truth** 是唯一解法。

### 4.2 目錄結構

```
repo/
├── shared/
│   ├── deviceTypes.ts      # enum + interfaces
│   └── deviceMapping.ts    # data
├── backend/
│   ├── src/config/config.ts  # 只留環境變數，型別/mapping re-export from shared
│   └── tsconfig.json       # rootDir: ".."（關鍵）
└── frontend/
    ├── src/config/config.ts  # 過濾 internal 後 re-export（前端看不到內部裝置）
    └── tsconfig.json       # include: ["src", "../shared"]
```

### 4.3 Backend tsconfig 指向上層

```json
{
  "compilerOptions": {
    "rootDir": "..",                               // 關鍵！
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts", "../shared/**/*.ts"]
}
```

結果 `dist` 變成 `dist/backend/src/*.js + dist/shared/*.js`。
Dockerfile `CMD` 要指向 `dist/backend/src/server.js`（不是 `dist/server.js`）。

### 4.4 Docker build context 在 repo 根

```yaml
# .github/workflows/deploy.yml
- run: docker build -f backend/Dockerfile -t backend:latest .
#                  ^^^^^^^^^^^^^^^^^^^^^                   ^
#                  Dockerfile 位置                         context = repo 根
```

Dockerfile 裡：
```dockerfile
WORKDIR /build
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./backend/
WORKDIR /build/backend
RUN npm ci --prefer-offline --no-audit --no-fund
WORKDIR /build
COPY backend/src ./backend/src
COPY shared ./shared                # ← 關鍵
WORKDIR /build/backend
RUN npm run build
```

### 4.5 前端過濾「內部裝置」

不想讓家人/客戶看到的站點（例如自家用的電池監測），在 shared mapping 加 `internal: true`，
前端 re-export 時過濾：

```ts
// frontend/src/config/config.ts
import { deviceMapping as rawDeviceMapping } from '../../../shared/deviceMapping';

export const deviceMapping: Record<string, AreaConfig> = Object.fromEntries(
  Object.entries(rawDeviceMapping).map(([key, area]) => [
    key,
    { ...area, devices: area.devices.filter(d => !d.internal) },
  ]),
);
```

Backend 不過濾，scanner 和專用 API 仍正常處理。
所有前端頁面（Home/History/Trend/Map）用同一個匯出，改一行設定全部同步。

---

## 5. 前端儀表板模式

### 5.1 即時頁（Home）核心原則

**Glance-ability：2 秒內要能看出有沒有異常**

- **正常**：中性灰邊、淺底、小字時間
- **異常（超閾值）**：紅底 + 6px 紅左邊 + 紅 ring + 「異常」pill + 值放大加粗
- **離線**：灰色 pill，不搶眼（不是重點）

反面教材：不要整牆都是繽紛 type 色（藍/綠/紫/粉…）。type 色只放在小 badge，主邊框留給異常警示。

### 5.2 狀態分層

```ts
type StatusTier = 'ok' | 'stale' | 'offline' | 'none';

function getStatusTier(timestamp: string | undefined): StatusTier {
  if (!timestamp) return 'none';
  const ageMin = (Date.now() - new Date(timestamp).getTime()) / 60000;
  if (ageMin > 24 * 60) return 'offline';
  if (ageMin > 75) return 'stale';   // 75 = 60 (上傳週期) + 15 (允許網路延遲)
  return 'ok';
}
```

**閾值公式：`staleMin = uploadIntervalMin + networkSlackMin`**
- 10 分鐘一次上傳 → `10 + 5 = 15`
- 1 小時一次（本專案）→ `60 + 15 = 75`
- 每天一次 → `24*60 + 180 = 1620`（3 小時寬限）

`offline` 通常抓 `staleMin * 2` 或 24 小時取大者。

### 5.3 Skeleton loading

載入中放跟實際卡片同形狀的骨架，視覺不跳動：

```tsx
<div className="flex">
  <div className="w-24 h-24 bg-slate-200 animate-pulse" />
  <div className="flex-1 p-4 space-y-2">
    <div className="h-4 bg-slate-200 animate-pulse rounded w-2/3" />
    <div className="h-3 bg-slate-100 animate-pulse rounded w-1/3" />
  </div>
</div>
```

### 5.4 篩選條件 preset (localStorage)

監測頁面一天看很多次、組合就那幾種（我的區、我的類型、最近一週）。存起來切換：

```ts
interface FilterPreset { name: string; /* ... filter fields */ }
const PRESETS_KEY = 'xxx_presets_v1';

const save = (name: string) => {
  const next = [...presets.filter(p => p.name !== name), newPreset];
  setPresets(next);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
};
```

chip UI 顯示各 preset，點擊套用、叉叉刪除。版號 `_v1` 留著之後格式變的時候切換不會爆。

### 5.5 CSV 匯出

UTF-8 BOM 開頭給 Excel 吃中文：

```ts
const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
```

欄位裡有 `,` / `"` / 換行要 escape：
```ts
const escape = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
```

### 5.6 表格排序

不要另外包 lib，用 `useMemo + sort key / dir` 就夠：

```ts
const [sortKey, setSortKey] = useState<'time'|'value'>('time');
const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');

const sorted = useMemo(() => {
  const arr = [...rows];
  arr.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'time':  cmp = +new Date(a.t) - +new Date(b.t); break;
      case 'value': cmp = (a.v ?? -Infinity) - (b.v ?? -Infinity); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return arr;
}, [rows, sortKey, sortDir]);
```

點 `<th>` 切換 asc/desc，圖示 `↕ ↑ ↓` 示意。

---

## 6. 圖表模式

用 [Recharts](https://recharts.org) 的原因：React 原生、SVG 渲染（可高 DPI）、Composed chart 支援混合圖。

### 6.1 基本 ComposedChart 結構

```tsx
<ResponsiveContainer width="100%" height={400}>
  <ComposedChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="time" tickFormatter={t => format(new Date(t), 'MM/dd HH:mm')} />
    <YAxis yAxisId="left" />
    <YAxis yAxisId="right" orientation="right" />
    <Tooltip />
    <Legend />
    <Line yAxisId="left" dataKey="pegf" stroke="#2563EB" />
    <Bar yAxisId="right" dataKey="raw" fill="#F59E0B" />
    <Brush dataKey="time" height={28} />  {/* 時間軸縮放 */}
  </ComposedChart>
</ResponsiveContainer>
```

### 6.2 多裝置疊圖

不同裝置上傳時間不一定對齊，合併成單一 x 軸時用 **union of timestamps + connectNulls**：

```ts
// 先處理主裝置
const byTime: Record<string, Row> = {};
primaryRows.forEach(r => byTime[r.time] = r);

// 每個比較裝置獨立抓資料，時間對不上就新增 row
for (const cmpId of compareIds) {
  const cmpRes = await axios.get(...);
  cmpRes.data.forEach(entry => {
    if (!byTime[entry.timestamp]) byTime[entry.timestamp] = { time: entry.timestamp };
    byTime[entry.timestamp][`${cmpId}__${ch}`] = value;
  });
}

// 按時間排序
const merged = Object.values(byTime).sort((a, b) => +new Date(a.time) - +new Date(b.time));

// 渲染時各 Line 加 connectNulls 讓缺點接線
<Line dataKey={`${cmpId}__AI_0`} connectNulls />
```

**調色盤陷阱**：primary 用 type 色（GE=綠），compare 池剛好也有綠 → 看不出哪條是誰。
疊圖模式時用統一 OVERLAY_PALETTE（藍/紅/橘/紫/粉/青）完全取代 type 色。

### 6.3 Single-point 不可見

`pointRadius: 0` + 資料只有 1–2 點 = 圖表什麼都看不到（line chart 需要至少兩點才有線）。

```ts
const pointRadius = totalPoints <= 20 ? 4 : 0;  // 點少時強制顯示圓點
```

### 6.4 Empty state 處理

資料是空的時候顯示文字覆蓋而不是空白圖：

```tsx
<div style={{ position: 'relative' }}>
  <Chart ... />
  {data.length === 0 && (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      尚未有資料
    </div>
  )}
</div>
```

### 6.5 Brush 縮放

加一行就有時間區間選擇：
```tsx
<Brush dataKey="time" height={28} stroke="#6366F1"
  tickFormatter={t => format(new Date(t), 'MM/dd HH:mm')} />
```

### 6.6 Tooltip 樣式

統一暗底白字、加指定 title/body 顏色避免預設藍（不同瀏覽器渲染差）：
```ts
tooltip: {
  backgroundColor: '#0f172a',
  titleColor: '#f1f5f9',
  bodyColor: '#e2e8f0',
  padding: 10,
  cornerRadius: 8,
}
```

---

## 7. 私有內部頁面

### 7.1 需求

「某些站點不想讓一般客戶看到，但又要給家人 / 自己方便瀏覽」。

不要改整個 auth 系統，用 **path obscurity**：
- 網址一段亂碼 `/view/80k-battery-f2a9c4`
- 不要 link 到這條路徑（沒 Google 索引不到）
- 想要更嚴一點再加 nginx Basic Auth

### 7.2 後端 mount

```ts
// app.ts
const BATTERY_VIEW_PATH = process.env.BATTERY_VIEW_PATH || '/view/80k-battery-f2a9c4';
app.use(BATTERY_VIEW_PATH, batteryRoutes);
```

整個 prefix 可設 env var 動態換。

### 7.3 Self-contained HTML

單頁 HTML + inline script + CDN Chart.js，全部存在 controller 的 TS template literal 裡：

```ts
export function serveBatteryPage(_req: Request, res: Response): void {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join('; '));
  res.type('html').send(PAGE_HTML);
}

const PAGE_HTML = `<!DOCTYPE html>...`;
```

**為什麼每個指令都需要**：
- `script-src 'self'`：allow 自家回應的 script（不過我們沒有）
- `script-src https://cdn.jsdelivr.net`：**allow Chart.js CDN**（helmet 預設不允許）
- `script-src 'unsafe-inline'`：**allow `<script>` 標籤內的 inline JS**（我們的刷新邏輯是寫 inline）
- `style-src 'unsafe-inline'`：allow `<style>` tag 內 CSS（整個頁面是內嵌樣式）
- `img-src data:`：inline SVG `data:image/svg+xml,...`

只 override 這一條 route 的 CSP，其他 `/api/*` 照 helmet 預設嚴格規則走。

### 7.4 動態 API base

網址有沒有結尾斜線 `./latest` 解析結果會差很多：
- `/view/abc` → `./latest` 變 `/view/latest` ❌
- `/view/abc/` → `./latest` 變 `/view/abc/latest` ✓

解決：
```js
const BASE = location.pathname.replace(/\/+$/, '');
const API_LATEST = BASE + '/latest';
```

### 7.5 設計給非技術使用者

- **大字狀態詞**：「電力正常 / 電力偏低 / 電力不足 / 連線中斷」42px 字體
- **整張卡背景色跟著狀態變**（綠/黃/紅），不只小角落的 pill
- **警示 banner**：非 OK 時 full-width 橫幅清楚說明
- **顯示原始訊號**：「換算後 25.36 V / 原始 17.53 mA」兩欄並列，萬一公式錯掉還有 fallback 可對照
- **30 秒自動刷新**，不要讓長輩自己按
- **不要用英文專有名詞**（「delta」、「raw」、「PEgF」改成「變化量」、「原始訊號」）

---

## 8. CI / CD / Docker

### 8.1 Lockfile 要入版控

專案開始時 `.gitignore` 常常把 `package-lock.json` 給擋了（從 library 專案複製設定時的壞習慣）。

**deploy 專案要納入版控**：
- `npm install` 要解析依賴樹 2-5 分鐘
- `npm ci` 直接照 lockfile 安裝 30 秒－1 分鐘
- 版本完全鎖定，build 結果可重現

```dockerfile
RUN npm ci --prefer-offline --no-audit --no-fund
```

旗標說明：
- `--prefer-offline`：有 npm cache 先用（CI 用 cache mount 時很有用）
- `--no-audit`：省 security 檢查 roundtrip（CI 不需要）
- `--no-fund`：省贊助訊息

### 8.2 Docker layer caching

COPY 順序要讓「不常變」的在前、「常變」在後：

```dockerfile
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci                                # 這層靠前面 3 個檔案 hash
COPY src ./src                            # src 變動不影響上面的層
RUN npm run build
```

只改 src 時重建只要跑 `npm run build` 那層，前面 `npm ci` 直接從 cache 撈。

### 8.3 完整的 multi-stage Dockerfile 範例

包 shared/ + monorepo 結構 + prod stage slim 化：

```dockerfile
# --- build stage ---
FROM node:20-bookworm AS build
WORKDIR /build

# 先 COPY package 檔讓 npm ci 能被 Docker cache 重用
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./backend/
WORKDIR /build/backend
RUN npm ci --prefer-offline --no-audit --no-fund

# 再 COPY source（常變）
WORKDIR /build
COPY backend/src ./backend/src
COPY shared ./shared

WORKDIR /build/backend
RUN npm run build
# 產出：/build/backend/dist/{backend/src/*.js, shared/*.js}

# --- production stage（可選 slim 基底減小 image size） ---
FROM node:20-bookworm
WORKDIR /app
RUN useradd -m app

# 只帶 package + prod deps，不帶 devDep (typescript 等)
COPY --from=build /build/backend/package*.json ./
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund

# 帶編譯產出
COPY --from=build /build/backend/dist ./dist

RUN mkdir -p /app/dist/backend/src/logs && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "dist/backend/src/server.js"]
```

**關鍵**：
- Build stage 與 production stage 分開 → 不把 100MB 的 devDeps 帶進最終 image
- 用 `node:20-slim` 可再瘦 70%，但某些 native dep (bcrypt) 需要 full base
- `HEALTHCHECK` 給 orchestrator (docker compose、k8s) 判斷服務起來沒

### 8.3 Build context

預設 Dockerfile 裡的 `COPY x y` 是從「build context」複製，context 是 `docker build` 後面那個路徑。
如果要 COPY 到父層的 `shared/`，context 必須是 repo 根，Dockerfile 位置用 `-f` 指定：

```bash
docker build -f backend/Dockerfile -t backend:latest .  # 點代表 context 是 repo 根
```

---

## 9. 設計系統

### 9.1 色彩分層

**Type colors**（區分感測器類別）：只放在 **小徽章 / icon**
- TI 藍 / WATER 青 / RAIN 靛 / GE 綠 / TDR 紫 / FLOW 粉 / BATTERY 橘

**Status colors**（區分狀態）：放在 **邊框 / 背景 / pill**
- 正常 emerald / 延遲 amber / 離線 red / 無資料 slate

不要混用！不要讓「type 色」出現在狀態語義位置，不然使用者會把「紫色」當成「警告」。

### 9.2 SVG icon 設計原則

每個 type 預設圖示都是 256×256 SVG，共用結構：

```svg
<svg viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg">
      <stop offset="0" stop-color="#色A"/>
      <stop offset="1" stop-color="#色B"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <!-- 白色或半透明白色的 icon shapes -->
</svg>
```

- 背景漸層 type 色（from-500 → to-600）
- 白色前景畫 pictogram
- stroke-width 6-8 在縮圖（96px）才看得清楚
- 透明度 0.3-0.7 做輔助元素（輔助線、dashed）

檔案大小 < 2KB（比 PNG 小 10-20 倍），縮放不糊。

### 9.3 Card 對照原則

```
┌─────┬──────────────────────────────┐
│     │ 站名（大）          ⓘ 即時  │  <- truncate 避免溢出
│ img │ 類型（小灰）                 │
│ 96  ├──────────────────────────────┤
│ ×   │ A軸           12.34"         │  <- 右對齊數值
│ 96  │ B軸          -23.45"         │
└─────┴──────────────────────────────┘
```

- 圖片 `w-24 shrink-0`（96px 固定寬）
- 站名 `line-clamp-2 break-all`（長名、MAC 不會被截斷成 `WIS...`）
- 異常時整張卡的 border 從中性變紅色 + 背景上紅色 tint，不只是值變紅

---

## 10. Design Review 工作流

寫完大的 UI 改動，別急著 push，請一個 agent 來審查。

### 10.1 Prompt template

```
You are a senior frontend/UI designer doing a design critique.

Read this file: <absolute path to tsx>
Context glance: <related files like sensor utils, navigation>

**Context**: <what this page does, who uses it, what they need>

**Things already present** (don't suggest adding): <existing features>

**Things I won't change**: <constraints like Chinese only, Tailwind only>

Please critique:
1. Glanceability
2. Visual hierarchy
3. Color system
4. Card density
5. Status indicators
6. Empty / error / loading states
7. Specific Tailwind classes that look wrong

Top 5 highest-impact issues + minor nits. Reference line numbers. <400 words. Be direct.
```

### 10.2 處理 feedback 的優先序

1. **高影響 bug**：實際使用體驗會受影響的（例：異常不夠顯眼）
2. **Dead code / bug**：發現的邏輯錯誤（例：永遠回傳 'ok' 的 branch）
3. **Typography / spacing**：視覺細節
4. **Nice-to-have**：審美偏好

第 4 類可以不急著改。前三類一輪 critique 通常可以解決 80% 問題。

### 10.3 不要盲目全採納

Agent 給的建議可能：
- 不符合專案約束（"加 react-query" 但專案只用 axios）
- 破壞既有功能（"把 image 拿掉" 但那是對現場照片的設計需求）
- 過度追求通用（"加 i18n" 但這是內部台灣專案）

取其中 60-80% 最有影響的採納、有爭議的跟使用者確認、剩下的略過。

---

## 11. 常見坑與修法

這一節是時間愈久愈值錢的「踩坑紀錄」，下次同樣錯誤才不會再花時間查。

### 症狀索引（壞掉時 Ctrl+F 看這個）

| 看到的錯誤訊息 / 現象 | 跳到 |
|---|---|
| `GET /.../latest 404`、`./xxx` 路徑解錯 | §11.1 |
| `Chart is not defined` | §11.2 |
| API 有回資料但圖表完全空白 | §11.3 |
| 加了 compare 裝置但疊圖只看到主線 | §11.4（跟 §6.2 是同一件事） |
| 本地正常、Linux deploy 變破圖 | §11.5 |
| CI build 慢到 5-10 分鐘 | §11.6 |
| Docker build `COPY shared: not found` | §11.7 |
| 早上查今天歷史資料結果少了一天 | §11.8 |
| 檔案有進 wise_data 但 InfluxDB 空空 | §11.9 |
| 虛擬裝置的 scanner 找不到 sensors | §11.10 |

### 11.1 相對路徑 `./latest` 沒結尾 `/` 解錯

- **症狀**：`GET /view/latest` 404
- **原因**：網址 `/view/abc` 沒結尾 /，瀏覽器把 `.` 當成 `/view/`
- **修法**：`const BASE = location.pathname.replace(/\/+$/, ''); const api = BASE + '/latest';`

### 11.2 Chart.js 被 helmet CSP 擋

- **症狀**：`Chart is not defined`
- **原因**：`app.use(helmet())` 預設 `script-src 'self'` 擋掉 jsdelivr
- **修法**：serveXxx 時覆寫 `Content-Security-Policy` header，只對這條 route 放寬

### 11.3 Recharts 少資料看不到

- **症狀**：圖表空白，但 API 明明有回資料
- **原因**：`pointRadius: 0` + 只有 1-2 點 = line 兩端無接續 = 什麼都畫不出來
- **修法**：`pointRadius = totalPoints <= 20 ? 4 : 0`

### 11.4 多裝置疊圖只看到主線

- **症狀**：加 compare 裝置、資料有回，但只有主線
- **原因**：合併邏輯 `if (!byTime[entry.timestamp]) return` 跳過時間戳不同步的點
- **修法**：不跳過，新增 row；所有 Line 加 `connectNulls`
- **完整模式說明**：見 §6.2

### 11.5 `water.png` 大小寫

- **症狀**：本地 Windows 正常，deploy Linux 變破圖
- **原因**：Linux filesystem case-sensitive，`water.png` vs `WATER.png` 是不同檔案
- **修法**：檔名跟 code 引用統一大小寫（建議全大寫 type 名）

### 11.6 CI build 超慢

- **症狀**：每次 deploy push 完等 5-10 分鐘
- **原因**：`.gitignore` 擋了 `package-lock.json`，Docker 裡 `npm install` 要解析整個依賴樹
- **修法**：取消 ignore、commit lockfile、Dockerfile 改 `npm ci`

### 11.7 Docker build context 缺 shared/

- **症狀**：`COPY shared ./shared: not found`
- **原因**：GitHub Action `working-directory: ./backend` + `docker build .`，context 只有 backend
- **修法**：workflow 改 `docker build -f backend/Dockerfile .`（context 變 repo 根）

### 11.8 時區錯一天

- **症狀**：早上查「今天」歷史資料，拿到的是昨天
- **原因**：`new Date().toISOString().slice(0,10)` 回傳 UTC 日期，台灣早上 8 點前 UTC 還是昨天
- **修法**：`import { formatInTimeZone } from 'date-fns-tz'; formatInTimeZone(now, 'Asia/Taipei', 'yyyy-MM-dd')`

### 11.9 Scanner 沒 config 吞資料

- **症狀**：檔案有進 wise_data、也移到 wise_backup_data，但 InfluxDB 沒資料
- **原因**：`convertWiseToInfluxPoints` 用 config 過濾 channel，config 沒那台 → 全過濾掉
- **修法**：加設備時**先改 config**再讓儀器上線。事後要補的資料從 backup 手動灌。

### 11.10 虛擬裝置 scanner 拿不到 sensors

- **症狀**：scanner 拿到實體 MAC，但前端拆成 SITE1/SITE2 虛擬裝置時查不到 sensors
- **原因**：`getSensorsByDeviceId` 只比對 `d.id === id`，實體 MAC 對不上虛擬 ID
- **修法**：用 `byExactId` + `byPhysicalId` 雙 cache，虛擬查不到就 fallback 實體聯集（見 2.3）

---

## Appendix: 專案快速起步檢查清單

接新監測專案時按順序做：

1. [ ] 建 `shared/deviceTypes.ts` + `shared/deviceMapping.ts` 骨架
2. [ ] Backend scaffolding：Express + helmet + cors + morgan + winston
3. [ ] Routes：`/upload_log/:mac/:logType/:date/:file`、`/api/latest`、`/api/history`、`/api/devices`
4. [ ] scannerService：cron + parse + write Influx + move backup
5. [ ] **先在 config 加儀器 → 再開通儀器上傳**（次序錯了資料會被 scanner 吞進 backup 但沒寫 DB）
6. [ ] Frontend：Vite + React + Tailwind + Recharts
7. [ ] 前端 config.ts re-export with internal filter
8. [ ] Home 頁 + 4 種 status tier + stats strip
9. [ ] History 頁 + 排序 + CSV + preset
10. [ ] TrendPage + Brush + 多裝置疊圖
11. [ ] 7 種 type SVG icon
12. [ ] Dockerfile：build context = repo 根、`npm ci`、COPY 順序對、multi-stage（見 §8.3）
13. [ ] `.gitignore` 移除 `package-lock.json`、commit lockfile
14. [ ] GitHub Actions `docker build -f backend/Dockerfile .`
15. [ ] 時區：server.ts `process.env.TZ = 'Asia/Taipei'`；前端查詢用 `formatInTimeZone`
