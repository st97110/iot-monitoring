// config/config.js

// API development & production 網址
export const API_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://api.lianyougeo.com'
    : 'http://localhost:3000';

// export const API_BASE = 'https://api.lianyougeo.com';

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

// 分區顯示順序（Home 頁分類按鈕可用）
export const DEVICE_TYPE_ORDER = [
  DEVICE_TYPES.ALL,
  DEVICE_TYPES.TI,
  DEVICE_TYPES.WATER,
  DEVICE_TYPES.GE,
  DEVICE_TYPES.RAIN,
  DEVICE_TYPES.TDR
];

export const deviceMapping = {
  '80K區': {
    name: '80K區',
    routeGroup: 't14',
    devices: [
      { id: 'TDR_T14_T1', name: 'T1', lat: 24.0175, lng: 121.128056, type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T2', name: 'T2', lat: 24.018056, lng: 121.129444, type: DEVICE_TYPES.TDR }
    ],
  },
  '春陽區': {
    name: '春陽區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_74FE48941ABE_SITE1',
        name: '84.6K',
        originalDeviceId: 'WISE-4010LAN_74FE48941ABE',
        lat: 24.0301,
        lng: 121.16,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], initialValues: { AI_0: 12.259 } },
          { name: 'B軸', channels: ['AI_1'], initialValues: { AI_1: 12.865 } },
        ]
      },
      {
        id: 'WISE-4010LAN_74FE48941ABE_SITE2',
        name: '84.65K',
        originalDeviceId: 'WISE-4010LAN_74FE48941ABE',
        lat: 24.0301,
        lng: 121.16,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], initialValues: { AI_2: 11.388 } },
          { name: 'B軸', channels: ['AI_3'], initialValues: { AI_3: 10.317 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2E3',
        name: '84.7K',
        lat: 24.0302,
        lng: 121.16,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], initialValues: { AI_2: 11.56 } },
          { name: 'B軸', channels: ['AI_3'], initialValues: { AI_3: 10.911 } },
        ]
      },
      { id: 'TDR_T14_AH3', name: 'AH3', lat: 24.029722, lng: 121.161389, type: DEVICE_TYPES.TDR }
    ]
  },
  '90K區': {
    name: '90K區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_74FE489299CB',
        name: 'W2',
        lat: 24.025278,
        lng: 121.18385,
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: '地下水位', channels: ['AI_0'], wellDepth: -50 },
        ]
      },
      {
        id: 'WISE-4060LAN_00D0C9FD4D44',
        name: 'H2-R',
        lat: 24.0267,
        lng: 121.184,
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '10分鐘雨量', channels: ['DI_0']},
        ]
      },
      { id: 'TDR_T14_T3', name: 'T3', lat: 24.0252, lng: 121.183611, type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T4', name: 'T4', lat: 24.0267, lng: 121.1838, type: DEVICE_TYPES.TDR }
    ]
  },
  '梅峰區': {
    name: '梅峰區',
    routeGroup: 't14',
    devices: [
      {
        id: 'WISE-4010LAN_00D0C9FAD2C9_SITE1',
        name: '14.25K-BT',
        originalDeviceId: 'WISE-4010LAN_00D0C9FAD2C9',
        lat: 24.08995,
        lng: 121.17361,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], initialValues: { AI_0: 12.052 } },
          { name: 'B軸', channels: ['AI_1'], initialValues: { AI_1: 11.798 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2C9_SITE2',
        name: '14.27K-BT',
        originalDeviceId: 'WISE-4010LAN_00D0C9FAD2C9',
        lat: 24.08995,
        lng: 121.17361,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], initialValues: { AI_2: 12.294 } },
          { name: 'B軸', channels: ['AI_3'], initialValues: { AI_3: 12.463 } },
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAC4F8',
        name: 'CH-1-BT',
        lat: 24.0898,
        lng: 121.17389,
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], initialValues: { AI_0: 5.684 } },
          { name: 'B軸', channels: ['AI_1'], initialValues: { AI_1: 12.974 } },
        ]
      },
      { id: 'WISE-4010LAN_74FE489299F4',
        name: 'BE1',
        lat: 24.08945,
        lng: 121.173611,
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: '伸縮量', channels: ['AI_0'], initialValues: { AI_0: 9.97 }, geRange: 500 }] },
      { id: 'WISE-4010LAN_74FE4890BAFC',
        name: 'BE2',
        lat: 24.0896,
        lng: 121.17395,
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: '伸縮量', channels: ['AI_0'], initialValues: { AI_0: 18.155 }, geRange: 500 }] },
      { id: 'WISE-4010LAN_74FE48941AD9',
        name: 'BE3',
        lat: 24.0890,
        lng: 121.174050,
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: '伸縮量', channels: ['AI_0'], initialValues: { AI_0: 4.82 }, geRange: 500 }] },
      { id: 'TDR_T14A_CH1', name: 'CH1', lat: 24.0898, lng: 121.1738, type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH2', name: 'CH2', lat: 24.0896, lng: 121.1741, type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH4', name: 'CH4', lat: 24.089, lng: 121.1739, type: DEVICE_TYPES.TDR }
    ]
  },
  '台8線107K區': {
    name: '台8線107K區',
    routeGroup: 't8',
    devices: [
      { id: 'TDR_T8_T1', name: 'TDR T1 (台8)', lat: 24.19277, lng: 121.30166, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T2', name: 'TDR T2 (台8)', lat: 24.19277, lng: 121.30166, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T4', name: 'TDR T4 (台8)', lat: 24.19277, lng: 121.30166, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T7', name: 'TDR T7 (台8)', lat: 24.19166, lng: 121.3025, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T8', name: 'TDR T8 (台8)', lat: 24.19277, lng: 121.30166, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T9', name: 'TDR T9 (台8)', lat: 24.19138, lng: 121.30361, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      {
        id: 'WISE-4010LAN_74FE4860F492',
        name: 'OW10 水位計',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW10', channels: ['AI_3'], type: DEVICE_TYPES.WATER, wellDepth: -50 }
        ]
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2C2',
        name: 'GE3 (50m, 70m) 伸縮計',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: 'GE3 50m', channels: ['AI_0'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_0: 4.984 } },
          { name: 'GE3 70m', channels: ['AI_1'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_1: 5.457 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE48595E19',
        name: 'BT1 & BT3 傾斜儀',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'BT1 A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_0: 12.073 } },
          { name: 'BT1 B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_1: 12.063 } },
          { name: 'BT3 A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_2: 10.794 } },
          { name: 'BT3 B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_3: 12.283 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486CEDFB',
        name: 'OW6 水位計',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW6', channels: ['AI_0'], type: DEVICE_TYPES.WATER, wellDepth: -50 }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486B76BB',
        name: 'BT2 傾斜儀',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'BT2 A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_2: 11.189 } },
          { name: 'BT2 B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_3: 11.896 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE488F3BA0',
        name: 'OW5 水位計',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW5', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -50 }
        ]
      },
      {
        id: 'WISE-4060LAN_00D0C9E332E8',
        name: '107K+600 雨量筒',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '10分鐘雨量', channels: ['DI_0'], type: DEVICE_TYPES.RAIN } // 雨量筒通常用 DI_0 Cnt
        ]
      },
      {
        id: 'WISE-4010LAN_74FE486B76AA',
        name: 'OW1 水位計 & GE1 伸縮計',
        area: '台8線107K區',
        lat: 24.19277,
        lng: 121.30166,
        sensors: [
          { name: 'OW1', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -50 },
          { name: 'GE1 (20m)', channels: ['AI_2'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_2: 4.175 } },
          { name: 'GE1 (80m)', channels: ['AI_3'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_3: 4.781 } }
        ]
      },
      {
        id: 'WISE-4010LAN_74FE487F4FE3',
        name: 'FL1~4 流量計',
        lat: 24.19277,
        lng: 121.30166,
        area: '台8線107K區',
        type: DEVICE_TYPES.FLOW, // ✨ 使用新的 FLOW 類型
        sensors: [
          { name: 'FL1', channels: ['AI_0'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL2', channels: ['AI_1'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL3', channels: ['AI_2'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ },
          { name: 'FL4', channels: ['AI_3'], type: DEVICE_TYPES.FLOW /* flowRateFactor: X (請補充) */ }
        ]
      }
    ]
  }
};