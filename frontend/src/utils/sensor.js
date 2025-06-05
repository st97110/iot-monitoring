import { DEVICE_TYPES } from '../config/config';

// ======== 設備類型對應顏色漸層 ========
const typeColors = {
  [DEVICE_TYPES.TI]: 'from-blue-500 to-blue-600',    // 傾斜儀
  [DEVICE_TYPES.WATER]: 'from-cyan-500 to-cyan-600', // 水位計
  [DEVICE_TYPES.RAIN]: 'from-indigo-500 to-indigo-600', // 雨量筒
  [DEVICE_TYPES.GE]: 'from-green-500 to-green-600', // 伸縮計
  [DEVICE_TYPES.TDR]: 'from-purple-500 to-purple-600', // TDR
};

// ======== 設備類型對應邊框顏色 ========
const typeBorderColors = {
  [DEVICE_TYPES.TI]: 'border-blue-500',    // 傾斜儀
  [DEVICE_TYPES.WATER]: 'border-cyan-500', // 水位計
  [DEVICE_TYPES.RAIN]: 'border-indigo-500', // 雨量筒
  [DEVICE_TYPES.GE]: 'border-green-500', // 伸縮計
  [DEVICE_TYPES.TDR]: 'border-purple-500', // TDR
};

// 根據設備資訊取得顏色
export function getDeviceTypeColor(device) {
  const type = device.type;
  return typeColors[type] || 'from-gray-500 to-gray-600';
}

// 根據設備資訊取得邊框顏色
export function getDeviceTypeBorderColor(device) {
  const type = device.type;
  return typeBorderColors[type] || 'border-gray-500';
}

export function isNormalData(device, chData) {
  if (device.type === DEVICE_TYPES.RAIN && chData?.rainfall_10m < 10) return true;          // 雨量筒小於 10 顯示為正常
  else if (device.type === DEVICE_TYPES.GE && Math.abs(chData?.Delta) < 50) return true;       // 伸縮計小於 30 顯示為正常
  else if (device.type === DEVICE_TYPES.TI && Math.abs(chData?.Delta) < 2 * 3600) return true; // 傾斜儀小於 5 度顯示為正常
  else if (device.type === DEVICE_TYPES.WATER && chData?.PEgF < -15) return true; // 水位計小於 -15 公尺顯示為正常
  return false;
}

function rawToPEgF(raw, type, wellDepth = -50, fsDeg = 15, geRange = 500) {
  switch (type) {
    case DEVICE_TYPES.WATER: {             // mA → m
      const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
      return ratio * (wellDepth ?? -50);
    }
    case DEVICE_TYPES.TI: {                       // mA → arc‑sec
      const fs  = fsDeg ?? 15;                    // ±FS°
      const deg = ((raw - 12) / 16) * (2 * fs);   // 4→‑fs, 12→0, 20→+fs
      return deg * 3600;                          // 度 → 秒
    }
    case DEVICE_TYPES.GE: {                       // mA → cm
      const ratio = (Math.min(Math.max(raw, 4), 20) - 4) / 16;
      return ratio * (geRange ?? 500);
    }
    default:
      return raw;
  }
}

/**
 * 依感測器類型回傳要顯示的文字與單位
 * @param deviceConfig - 完整的設備配置對象 (包含 device.type)
 * @param sensor - 當前感測器的配置對象 (包含 sensor.type, wellDepth, initialValues 等)
 * @param chData - 當前通道的數據 (例如 entry.channels[ch])
 * @param allEntryData - 該時間點的完整數據記錄 (例如 entry，可能包含 rainfall_10m 或 raw)
 * @returns 格式化後的數值字串
 */
export function formatValue(deviceConfig, sensor, chData, allEntryData) {
  // 優先使用 sensor.type，如果沒有則使用 device.type
  const typeToUse = sensor.type || deviceConfig.type;
  // 如果 EgF 為 20 或 4，則顯示 N/A
  if (chData?.EgF == 20 || chData?.EgF == 4) return 'N/A';

  switch (typeToUse) {
    case DEVICE_TYPES.WATER: {
      // 水位計的 PEgF 通常在 chData.PEgF 或 allEntryData.raw[`${sensor.channels[0]} PEgF`]
      // 假設 chData 結構是 { PEgF: value }
      return chData?.EgF != null && !isNaN(chData?.EgF) ? `${rawToPEgF(chData?.EgF, typeToUse, sensor?.wellDepth).toFixed(2)} m` : 
            chData?.PEgF != null && !isNaN(chData?.PEgF) ? `${chData?.PEgF.toFixed(2)} m` : 'N/A';
    }
    case DEVICE_TYPES.RAIN: {
      // 雨量筒在 History 頁面，我們更關注單筆記錄的原始計數或已計算的十分鐘雨量
      // 如果 API 返回的 entry 中已有 'rainfall_10m' (由 enrichRainfall 添加)
      if (allEntryData.rainfall_10m !== undefined && allEntryData.rainfall_10m !== null) {
        return `${allEntryData.rainfall_10m.toFixed(1)} mm`;
      }
      // 否則，嘗試顯示原始計數
      const cnt = chData?.Cnt; // 假設 DI_0 Cnt 的 metric 是 'Cnt'
      return cnt != null && !isNaN(cnt) ? `${cnt} counts` : 'N/A';
    }
    case DEVICE_TYPES.GE: {
      // 伸縮計：優先使用 chData.EgF計算 ，如果沒有則使用 chData.Delta
      let raw = chData?.EgF;
      let pe = rawToPEgF(raw, typeToUse, sensor?.wellDepth, sensor?.fsDeg, sensor?.geRange);
      const initPe = rawToPEgF(sensor.initialValues[`${sensor.channels[0]}`], typeToUse, sensor?.wellDepth, sensor?.fsDeg, sensor.geRange);
      return pe != null && !isNaN(pe) && initPe != null && !isNaN(initPe) ? `${(pe - initPe).toFixed(2)} mm` : 
            chData?.PEgF != null && !isNaN(chData?.PEgF) ? `${chData?.PEgF.toFixed(2)} mm` : 'N/A';
    }
    case DEVICE_TYPES.TI: {
      // 傾斜儀：類似伸縮計
      let raw = chData?.EgF;
      let pe = rawToPEgF(raw, typeToUse, sensor?.wellDepth, sensor?.fsDeg);
      const initPe = rawToPEgF(sensor.initialValues[`${sensor.channels[0]}`], typeToUse, sensor?.wellDepth, sensor?.fsDeg);
      return pe != null && !isNaN(pe) && initPe != null && !isNaN(initPe) ? `${(pe - initPe).toFixed(1)} "` : 
            chData?.PEgF != null && !isNaN(chData?.PEgF) ? `${chData?.PEgF.toFixed(1)} "` : 'N/A';
    }
    default: { // 其他類型或未知類型，嘗試顯示 EgF
      const v = chData?.EgF;
      return v != null && !isNaN(v) ? v.toFixed(3) : 'N/A';
    }
  }
}