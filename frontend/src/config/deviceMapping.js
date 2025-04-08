import { DEVICE_TYPES } from "./constants";

export const deviceMapping = {
  '74FE48941ABE': {
    name: '台14線84K(春陽下)',
    sensors: [
      { name: 'BT_84.6K A (A軸)', channels: ['AI_0'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_0: 12.259, // optional
        }
      },
      { name: 'BT_84.6K B (B軸)', channels: ['AI_1'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_1: 12.865  // optional
        }
      },
    ]
  },
  '00D0C9FAD2E3': {
    name: '台14線84K(春陽下)',
    sensors: [
      { name: 'BT_84.65K A (A軸)', channels: ['AI_0'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_0: 11.388, // optional
        }
      },
      { name: 'BT_84.65K B (B軸)', channels: ['AI_1'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_1: 10.317  // optional
        }
      },
      { name: 'BT_84.7K A (A軸)', channels: ['AI_2'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_2: 11.56, // optional
        }
      },
      { name: 'BT_84.7K B (B軸)', channels: ['AI_3'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_3: 10.911  // optional
        }
      },
    ]
  },
  '74FE489299CB': {
    name: '台14線90K(攝影機)',
    sensors: [
      { name: '地下水位計W2', channels: ['AI_0'], type: DEVICE_TYPES.WATER },
    ]
  },
  '00D0C9FD4D44': {
    name: '台14線91.5K',
    sensors: [
      { name: '91.5k雨量筒', channels: ['AI_0'], type: DEVICE_TYPES.RAIN },
    ]
  },
  '00D0C9FAD2C9': {
    name: '台 14 甲線14.2K(梅峰護欄)',
    sensors: [
      { name: '14.25k A (A軸)', channels: ['AI_0'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_0: 12.052, // optional
        }
      },
      { name: '14.25k B (B軸)', channels: ['AI_1'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_1: 11.798  // optional
        }
      },
      { name: '14.27k A (A軸)', channels: ['AI_2'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_2: 12.294, // optional
        }
      },
      { name: '14.27k B (B軸)', channels: ['AI_3'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_3: 12.463  // optional
        }
      },
    ]
  },
  '00D0C9FAC4F8': {
    name: '台 14 甲線(機箱倒)-CH1',
    sensors: [
      { name: 'BT_CH1A (A軸)', channels: ['AI_0'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_0: 5.684, // optional
        }
      },
      { name: 'BT_CH1B (B軸)', channels: ['AI_1'], type: DEVICE_TYPES.TI,
        initialValues: {
          AI_1: 12.974  // optional
        }
      },
    ]
  },
  '74FE489299F4': {
    name: '台 14 甲線(水位計上)-CH2',
    sensors: [
      { name: 'GE1', channels: ['AI_0'], type: DEVICE_TYPES.GE,
        initialValues: {
          AI_0: 9.97, // optional
        }
      },
    ]
  },
  '74FE4890BAFC': {
    name: '台 14 甲線(小路轉彎)-CH3',
    sensors: [
      { name: 'GE2', channels: ['AI_0'], type: DEVICE_TYPES.GE,
        initialValues: {
          AI_0: 18.155, // optional
        }
      },
    ]
  },
  '74FE48941AD9': {
    name: '台 14 甲線(梅峰農場)-CH4',
    sensors: [
      { name: 'GE3', channels: ['AI_0'], type: DEVICE_TYPES.GE,
        initialValues: {
          AI_0: 4.82, // optional
        }
      },
    ]
  },
};
