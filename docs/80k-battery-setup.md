# 80K T2 太陽能電池監測 建置紀錄

日期：2026-04-20
設備：WISE-4010LAN，MAC `74FE48ADBD13`，裝在台14線 80K 區 T2 站點
目的：家人能從瀏覽器直接看太陽能系統的電池電壓，不需看 CSV 也不懂英文

---

## 一、最終成果

**私人檢視頁（path 隱藏，無 auth）**
```
https://api.lianyougeo.com/view/80k-battery-f2a9c4/
```

- 繁中單頁、30 秒自動刷新
- 大字狀態（電力正常／偏低／不足／連線中斷），背景色跟著狀態變（綠／黃／紅）
- 電池容量視覺化（左側填色動畫）
- 換算電壓 + 原始 mA 對照顯示（避免公式錯誤時沒有退路）
- 24 小時走勢圖，雙 Y 軸（左換算 V、右原始 mA）

---

## 二、架構決策

### 沿用現有 pipeline，不另寫程式

原系統已有完整的 WISE 資料流：
```
WISE POST → /upload_log/<MAC>/signal_log/<date>/<file>
          → saveFile 自動建資料夾
          → dataScanScheduler 每 10 分鐘掃一次
          → parseWiseCSVFile → convertWiseToInfluxPoints → InfluxDB (wise_raw)
```

新機只要 config 多一筆，資料就會自動流進來，不用另寫任何程式。

### 前端獨立，不共用 monitoring 主站

家人不想讓外人看到這台電池站，且主站是給工程師用的（英文專有名詞多）。
解法：後端另開一個 obscure path，嵌一支 100 多行單檔 HTML，專供家人看。

---

## 三、Config 修改

### `backend/src/config/config.ts`

**1. 新增 DEVICE_TYPES.BATTERY**
```ts
export enum DEVICE_TYPES {
  // ... 既有
  BATTERY = 'BATTERY',
}
```

**2. 擴充 Sensor interface**
```ts
export interface Sensor {
  // ... 既有
  scaleMin?: number;  // 4mA 對應工程值
  scaleMax?: number;  // 20mA 對應工程值
  unit?: string;      // 顯示單位
}
```

**3. 在 80K 區加這台 WISE**
```ts
'80K區': {
  devices: [
    { id: 'TDR_T14_T1', ... },
    { id: 'TDR_T14_T2', ... },  // T2 同時有 TDR 和 WISE，都保留
    {
      id: 'WISE-4010LAN_74FE48ADBD13',
      name: 'T2 電池電壓',
      type: DEVICE_TYPES.BATTERY,
      sensors: [
        { name: '電池電壓', channels: ['AI_0'], type: DEVICE_TYPES.BATTERY,
          scaleMin: 0, scaleMax: 30, unit: 'V' },
      ]
    }
  ]
}
```

### `backend/src/utils/helper.ts`

`rawToPEgF` 新增 BATTERY case（4-20mA 線性）：
```ts
case DEVICE_TYPES.BATTERY: {
  const lo = ctx.scaleMin ?? 0;
  const hi = ctx.scaleMax ?? 100;
  const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
  return lo + ratio * (hi - lo);
}
```

---

## 四、新增檔案

### `backend/src/controllers/batteryController.ts`

三個 handler：
- `serveBatteryPage` — 回傳內嵌 HTML + 覆寫 CSP 允許 jsdelivr
- `getBatteryLatestJson` — 呼叫 `safeGetLatestData('wise', DEVICE_ID)` 抓最新
- `getBatteryHistoryJson` — 呼叫 `safeGetHistoryData` 抓 24h

用 `safeGet*` 而非 `queryLatestDataFromInflux` 直接打 DB，這樣沿用原系統的
fallback（DB → 資料夾）與時區處理。

### `backend/src/routes/batteryRoutes.ts`

三條 route：`/`、`/latest`、`/history`

### `backend/src/app.ts`（改）

```ts
const BATTERY_VIEW_PATH = process.env.BATTERY_VIEW_PATH || '/view/80k-battery-f2a9c4';
app.use(BATTERY_VIEW_PATH, batteryRoutes);
```

換 URL 只要改這個常數，或設環境變數。

---

## 五、API 回應格式

**GET `/view/80k-battery-f2a9c4/latest`**
```json
{
  "deviceId": "WISE-4010LAN_74FE48ADBD13",
  "deviceName": "T2 電池電壓",
  "timestamp": "2026-04-20T14:43:59Z",
  "sensors": [{
    "name": "電池電壓",
    "channel": "AI_0",
    "unit": "V",
    "value": 25.346,      // 換算後（PEgF）
    "rawUnit": "mA",
    "rawValue": 17.518,   // 原始（EgF）
    "scaleMin": 0,
    "scaleMax": 30
  }]
}
```

**GET `/view/80k-battery-f2a9c4/history?hours=24`**
```json
{
  "hours": 24,
  "series": [
    { "kind": "converted", "unit": "V", "points": [{ "t": "...Z", "v": 25.35 }, ...] },
    { "kind": "raw",       "unit": "mA", "points": [{ "t": "...Z", "v": 17.52 }, ...] }
  ]
}
```

---

## 六、前端狀態邏輯（在 HTML 內嵌的 JS）

```
閾值（WISE 一小時一次上傳，所以都算相對寬鬆）
  資料新鮮度：<75 分 ok、75-150 分 warn、>150 分 bad
  電量百分比：>=55% ok、30-55% warn、<30% bad

最終狀態 = 取兩者較嚴重者
顯示字：
  - 狀態最嚴重來自新鮮度時顯示「連線中斷／延遲更新」
  - 否則顯示「電力正常／偏低／不足」
```

---

## 七、踩過的坑

| 狀況 | 原因 | 解法 |
|------|------|------|
| WISE 連不上 server | WISE config Server Port = 8000，當時我誤以為應該改 80，user 指出實際部署 compose 把 8000:3000 map 出來 | 保持 8000 |
| `Invalid or Idle` | 不是錯誤，是 WISE 還沒到排程上傳時間（設 36000s = 10 小時間隔…但實際每小時一筆）| 等 |
| /latest 回來沒資料 | 自己寫 flux query 怪怪的 | 改用原系統的 `safeGetLatestData`，沿用既有 fallback + 時區處理 |
| `./latest` 404 | 網址無結尾斜線時，`./` 解到上層 `/view/` | 用 `location.pathname.replace(/\/+$/, '') + '/latest'` 動態算 |
| 圖表完全看不到 | `pointRadius: 0` + 點少時 line chart 畫不出東西 | 點數 ≤ 20 時強制顯示 4px 圓點 |
| `Chart is not defined` | `helmet()` 預設 `script-src 'self'` 擋掉 jsdelivr | 在 `serveBatteryPage` 覆寫 CSP，允許 `cdn.jsdelivr.net` |
| 狀態一直黃 | 20/60 分鐘的閾值是給 10 分鐘 scan 設計，小時級資料剛上傳完就超過 20 分 | 改為 75/150 分 |

---

## 八、未來可調項

1. **實際電池系統電壓範圍** — 目前資料看起來是 24V 系統（白天充電 27.7V，夜間 25V）。
   精準一點的話 `scaleMin: 22, scaleMax: 28` 比現在的 `0/30` 更能反映真實電量。

2. **電量百分比閾值** — 目前 `<30%=bad / <55%=warn` 是通用線性。如果你有
   這套電池的 datasheet 低電壓告警值，可以改成直接比對電壓：
   `< 23V = bad / < 24V = warn`（24V 系統）。

3. **月備份腳本** — `scripts/devices.json` 的 `T14-WISE` / `OTHER-WISE`
   群組還沒加這台 MAC，如果要把這台納入月備份 artifact 就要加。

4. **改 URL path** — `/view/80k-battery-f2a9c4` 只是 obscure，不是 auth。
   若要真正擋外人，nginx 加 basic_auth 一行即可。

---

## 九、這次 session 的 commits

```
9618e28 電池頁：覆寫 CSP 允許 Chart.js CDN
45092a2 電池頁：修圖表不顯示 + 配合每小時上傳的新鮮度閾值
f16ac5e 電池頁 UI v2：讓顏色和大字直接回答「現在 OK 嗎」
509f517 重新設計電池檢視頁 UI／加電池視覺化與色彩
034c1ea 修正電池頁 API 相對路徑解析
b74e68a 還原 TDR_T14_T2 設定
935ecb7 電池頁改用 safeGetLatest/History 並修時區 + 清理 T2 設定
251ca6d 只保留 AI_0 電池電壓，並在頁面顯示原始訊號
1f84251 新增80K太陽能電池監測站點與內部檢視頁
```
