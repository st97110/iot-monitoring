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

/** 依感測器類型回傳要顯示的文字與單位 */
export function formatValue(device, chData, allData) {
  switch (device.type) {
    case DEVICE_TYPES.WATER: {                       // 水位計：PEgF → m
    const v = chData?.PEgF;
    return v != null ? `${v.toFixed(2)} m` : '無資料';
    }
    case DEVICE_TYPES.RAIN: {                        // 雨量筒：10‑min 雨量 → mm
    const v = allData.rainfall_10m;
    return v != null ? `${v.toFixed(1)} mm` : '無資料';
    }
    case DEVICE_TYPES.GE: {                          // 伸縮計：Display → mm
    const d = chData?.Display ?? chData?.Delta;
    return d != null ? `${d.toFixed(2)} mm` : '無資料';
    }
    case DEVICE_TYPES.TI: {                          // 傾斜儀：Display → ″
    const d = chData?.Display ?? chData?.Delta;
    return d != null ? `${d.toFixed(1)} "` : '無資料';
    }
    default: {                                       // 其它顯 raw EgF
    const v = chData?.EgF;
    return v != null ? v.toFixed(3) : '無資料';
    }
  }
}