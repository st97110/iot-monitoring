// 裝置類型代碼（type）
export const DEVICE_TYPES = {
    ALL: '',
    TI: 'TI',         // 傾斜儀（TIltmeter）
    WATER: 'WATER',   // 水位計
    RAIN: 'RAIN',     // 雨量筒
    GE: 'GE',         // 伸縮計
    TDR: 'TDR',       // TDR
  };
  
  // 類型對應顯示名稱
  export const DEVICE_TYPE_NAMES = {
    [DEVICE_TYPES.ALL]: '全部',
    [DEVICE_TYPES.TI]: '傾斜儀',
    [DEVICE_TYPES.WATER]: '水位計',
    [DEVICE_TYPES.RAIN]: '雨量筒',
    [DEVICE_TYPES.GE]: '伸縮計',
    [DEVICE_TYPES.TDR]: 'TDR',
  };
  
  // 類型顯示順序（Home 頁分類按鈕可用）
  export const DEVICE_TYPE_ORDER = [
    DEVICE_TYPES.ALL,
    DEVICE_TYPES.TI,
    DEVICE_TYPES.WATER,
    DEVICE_TYPES.GE,
    DEVICE_TYPES.RAIN,
    DEVICE_TYPES.TDR
  ];
  