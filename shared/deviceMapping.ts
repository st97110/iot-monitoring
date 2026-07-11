// 前後端共用的 deviceMapping（Single Source of Truth）
// 規則：
//   - 前端需要的顯示欄位（lat, lng, name, sourceType）是 first-class
//   - 後端需要的計算欄位（fsDeg, wellDepth, scaleMin/Max, sourceChannelMapping）也在
//   - 同一台實體 WISE 可以拆成多個虛擬裝置 (_SITE1/_SITE2/_OW1/_GE1)，用 originalDeviceId 指回實體 ID

import { AreaConfig, DEVICE_TYPES } from './deviceTypes';

export const deviceMapping: Record<string, AreaConfig> = {
  '80K區': {
    name: '80K區',
    routeGroup: 't14',
    defaultCenter: [24.01778, 121.12875],
    defaultZoom: 17,
    devices: [
      { id: 'TDR_T14_T1', name: 'T1', lat: 24.0175, lng: 121.128056, area: '80K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T2', name: 'T2', lat: 24.018056, lng: 121.129444, area: '80K區', type: DEVICE_TYPES.TDR },
      {
        id: 'WISE-4010LAN_74FE48ADBD13',
        name: 'T2 電池電壓',
        lat: 24.018056,
        lng: 121.129444,
        area: '80K區',
        type: DEVICE_TYPES.BATTERY,
        internal: true,  // 內部裝置：只在 /view/80k-battery-* 顯示，一般前端不顯示
        sensors: [
          // 24V 系統預設 0–30V，實機若不同請改 scaleMax
          { name: '電池電壓', channels: ['AI_0'], type: DEVICE_TYPES.BATTERY, scaleMin: 0, scaleMax: 30, unit: 'V' },
        ],
      },
    ],
  },

  '春陽區': {
    name: '春陽區',
    routeGroup: 't14',
    defaultCenter: [24.0300, 121.1605],
    defaultZoom: 17,
    devices: [
      {
        id: 'WISE-4010LAN_74FE48941ABE',
        name: '84.6K',
        lat: 24.0301,
        lng: 121.16,
        area: '春陽區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_0: 12.259 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_1: 12.865 } },
        ],
      },
      {
        id: 'SN_6963',
        name: '84.65K', // 準星 ly-tiltmeter sn=6963
        lat: 24.0302,
        lng: 121.16,
        area: '春陽區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'TI-13A軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'TI-13B軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      {
        id: 'SN_3788',
        name: '84.7K', // 準星 ly-friend sn=3788
        lat: 24.0302,
        lng: 121.16,
        area: '春陽區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'ETI-3A軸角度(Y)' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'ETI-3B軸角度(X)' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      { id: 'TDR_T14_AH3', name: 'AH3', lat: 24.029722, lng: 121.161389, area: '春陽區', type: DEVICE_TYPES.TDR },
    ],
  },

  '90K區': {
    name: '90K區',
    routeGroup: 't14',
    defaultCenter: [24.0260, 121.1837],
    defaultZoom: 17,
    devices: [
      {
        id: 'WISE-4010LAN_74FE489299CB',
        name: 'W2',
        lat: 24.025278,
        lng: 121.18385,
        area: '90K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          // 公式：前端走特殊邏輯 (I0-4)*2.5-33.45 m；backend 用 wellDepth 線性
          { name: '地下水位', channels: ['AI_0'], type: DEVICE_TYPES.WATER, wellDepth: -35, alertMuted: true },
        ],
      },
      {
        id: 'WISE-4060LAN_00D0C9FD4D44',
        name: 'H2-R',
        lat: 24.0267,
        lng: 121.184,
        area: '90K區',
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '10分鐘雨量', channels: ['DI_0'], type: DEVICE_TYPES.RAIN },
        ],
      },
      { id: 'TDR_T14_T3', name: 'T3', lat: 24.0252, lng: 121.183611, area: '90K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14_T4', name: 'T4', lat: 24.0267, lng: 121.1838, area: '90K區', type: DEVICE_TYPES.TDR },
    ],
  },

  '梅峰區': {
    name: '梅峰區',
    routeGroup: 't14',
    defaultCenter: [24.0895, 121.1738],
    defaultZoom: 16,
    devices: [
      // 同一台 WISE，前端拆兩個站點（不同 AI pair）
      {
        id: 'WISE-4010LAN_00D0C9FAD2C9_SITE1',
        originalDeviceId: 'WISE-4010LAN_00D0C9FAD2C9',
        name: '14.25K-BT',
        lat: 24.08995,
        lng: 121.17361,
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_0: 12.052 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, fsDeg: 15, initialValues: { AI_1: 11.798 } },
        ],
      },
      {
        // 2026-07 由 WISE(00D0C9FAD2C9 SITE2, AI_2/AI_3) 換成準星 sn=6722。
        // 原 WISE 盒子的 14.25K-BT (SITE1) 仍維持 WISE 不變。
        id: 'SN_6722',
        name: '14.27K-BT', // 準星 sn=6722
        lat: 24.08995,
        lng: 121.17361,
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'TI-2A軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'TI-2B軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      {
        id: 'SN_6721',
        name: '14甲CH1傾斜儀', // 準星 ly-mayhill sn=6721
        lat: 24.0898,
        lng: 121.1738,
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'TI-1A軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'TI-1B軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      {
        id: 'SN_24782',
        name: '14甲CH3傾斜儀', // 準星 ly-road sn=24782
        lat: 24.08945,
        lng: 121.173611,
        area: '梅峰區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'ETI-2A軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'ETI-2B軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE489299F4',
        name: 'BE1',
        lat: 24.08945,
        lng: 121.173611,
        area: '梅峰區',
        type: DEVICE_TYPES.GE,
        sensors: [
          // alertMuted: 2026-07-07 起 AI_1 感測器故障（滿檔 20mA 兩天後劇烈彈跳 ±10~90mm/5min），
          // 待現場檢修。修復並確認讀值穩定後移除此旗標恢復告警。
          { name: '伸縮量', channels: ['AI_1'], type: DEVICE_TYPES.GE, initialValues: { AI_1: 9.97 }, geRange: 500, alertMuted: true },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE4890BAFC',
        name: 'BE2',
        lat: 24.0896,
        lng: 121.17395,
        area: '梅峰區',
        type: DEVICE_TYPES.GE,
        sensors: [
          // 2026-05-11 重裝後歸零：當下 EgF = 7.86 mA 設為新 initial
          { name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 7.86 }, geRange: 500 },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE48941AD9',
        name: 'BE3',
        lat: 24.0890,
        lng: 121.174050,
        area: '梅峰區',
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: '伸縮量', channels: ['AI_0'], type: DEVICE_TYPES.GE, initialValues: { AI_0: 4.82 }, geRange: 500 },
        ],
      },
      { id: 'TDR_T14A_CH1', name: 'CH1', lat: 24.0898, lng: 121.1738, area: '梅峰區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH2', name: 'CH2', lat: 24.0896, lng: 121.1741, area: '梅峰區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T14A_CH4', name: 'CH4', lat: 24.089, lng: 121.1739, area: '梅峰區', type: DEVICE_TYPES.TDR },
    ],
  },

  '台8線107K區': {
    name: '台8線107K區',
    routeGroup: 't8',
    defaultCenter: [24.1920, 121.3025],
    defaultZoom: 17,
    devices: [
      { id: 'TDR_T8_T1', name: 'TDR T1 (台8)', lat: 24.1922, lng: 121.30328, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T2', name: 'TDR T2 (台8)', lat: 24.1929, lng: 121.30168, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T4', name: 'TDR T4 (台8)', lat: 24.19278, lng: 121.30282, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T7', name: 'TDR T7 (台8)', lat: 24.19166, lng: 121.3025, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T8', name: 'TDR T8 (台8)', lat: 24.19165, lng: 121.30325, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      { id: 'TDR_T8_T9', name: 'TDR T9 (台8)', lat: 24.19138, lng: 121.30361, area: '台8線107K區', type: DEVICE_TYPES.TDR },
      {
        id: 'WISE-4010LAN_74FE4860F492',
        name: 'OW10 水位計',
        lat: 24.19165,
        lng: 121.30313,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW10', channels: ['AI_3'], type: DEVICE_TYPES.WATER, wellDepth: -40 },
        ],
      },
      {
        id: 'WISE-4010LAN_00D0C9FAD2C2',
        name: 'GE3 (20m, 80m) 伸縮計',
        lat: 24.1922,
        lng: 121.3034,
        area: '台8線107K區',
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: 'GE3 20m', channels: ['AI_0'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_0: 4.984 } },
          { name: 'GE3 80m', channels: ['AI_1'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_1: 5.457 } },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE48595E19',
        name: 'BT1 傾斜儀',
        lat: 24.19247,
        lng: 121.3028,
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_0'], type: DEVICE_TYPES.TI, fsDeg: 10, initialValues: { AI_0: 12.073 } },
          { name: 'B軸', channels: ['AI_1'], type: DEVICE_TYPES.TI, fsDeg: 10, initialValues: { AI_1: 12.063 } },
        ],
      },
      {
        id: 'SN_6955',
        name: 'BT3 傾斜儀', // 準星 ly-tiltmeter sn=6955
        lat: 24.19220,
        lng: 121.30304,
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sourceType: 'geostar',
        sensors: [
          {
            name: 'A軸角度',
            channels: ['AI_0'],
            sourceChannelMapping: { AI_0: 'TI-5A軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_0: 0 },
          },
          {
            name: 'B軸角度',
            channels: ['AI_1'],
            sourceChannelMapping: { AI_1: 'TI-5B軸角度' },
            type: DEVICE_TYPES.TI,
            initialValues: { AI_1: 0 },
          },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE486CEDFB_OW6',
        originalDeviceId: 'WISE-4010LAN_74FE486CEDFB',
        name: 'OW6 水位計',
        lat: 24.1928,
        lng: 121.3018,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW6', channels: ['AI_0'], type: DEVICE_TYPES.WATER, wellDepth: -40 },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE486B76BB',
        name: 'BT2 傾斜儀',
        lat: 24.19256,
        lng: 121.30189,
        area: '台8線107K區',
        type: DEVICE_TYPES.TI,
        sensors: [
          { name: 'A軸', channels: ['AI_2'], type: DEVICE_TYPES.TI, fsDeg: 30, initialValues: { AI_2: 11.189 } },
          { name: 'B軸', channels: ['AI_3'], type: DEVICE_TYPES.TI, fsDeg: 30, initialValues: { AI_3: 11.896 } },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE488F3BA0',
        name: 'OW5 水位計',
        lat: 24.1923,
        lng: 121.3023,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW5', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -50 },
        ],
      },
      {
        id: 'WISE-4060LAN_00D0C9E332E8',
        name: '107K+600 雨量筒',
        lat: 24.1934,
        lng: 121.3025,
        area: '台8線107K區',
        type: DEVICE_TYPES.RAIN,
        sensors: [
          { name: '10分鐘雨量', channels: ['DI_0'], type: DEVICE_TYPES.RAIN },
        ],
      },
      // 同一台 WISE 拆兩站點
      {
        id: 'WISE-4010LAN_74FE486B76AA_OW1',
        originalDeviceId: 'WISE-4010LAN_74FE486B76AA',
        name: 'OW1 水位計',
        lat: 24.19282,
        lng: 121.30253,
        area: '台8線107K區',
        type: DEVICE_TYPES.WATER,
        sensors: [
          { name: 'OW1', channels: ['AI_1'], type: DEVICE_TYPES.WATER, wellDepth: -80 },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE486B76AA_GE1',
        originalDeviceId: 'WISE-4010LAN_74FE486B76AA',
        name: 'GE1 伸縮計',
        lat: 24.19278,
        lng: 121.30268,
        area: '台8線107K區',
        type: DEVICE_TYPES.GE,
        sensors: [
          { name: 'GE1 (20m)', channels: ['AI_2'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_2: 4.554 } },
          { name: 'GE1 (80m)', channels: ['AI_3'], type: DEVICE_TYPES.GE, geRange: 500, initialValues: { AI_3: 5.246 } },
        ],
      },
      {
        id: 'WISE-4010LAN_74FE487F4FE3',
        name: 'FL1~4 流量計',
        lat: 24.19295,
        lng: 121.30225,
        area: '台8線107K區',
        type: DEVICE_TYPES.FLOW,
        sensors: [
          { name: 'FL1', channels: ['AI_0'], type: DEVICE_TYPES.FLOW, flowMax: 130 },
          { name: 'FL2', channels: ['AI_1'], type: DEVICE_TYPES.FLOW, flowMax: 130 },
          { name: 'FL3', channels: ['AI_2'], type: DEVICE_TYPES.FLOW, flowMax: 130 },
          { name: 'FL4', channels: ['AI_3'], type: DEVICE_TYPES.FLOW, flowMax: 130 },
        ],
      },
    ],
  },
};
