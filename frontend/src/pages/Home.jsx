import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, DEVICE_TYPES, DEVICE_TYPE_NAMES, DEVICE_TYPE_ORDER, deviceMapping } from '../config/config';

function getRelativeTime(isoString) {
  const time = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分鐘前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小時前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

function Home() {
  const [latestData, setLatestData] = useState({});
  const [filterType, setFilterType] = useState(DEVICE_TYPES.ALL);

  useEffect(() => {
    axios.get(`${API_BASE}/api/latest`)
      .then(res => setLatestData(res.data))
      .catch(err => console.error('取得最新資料失敗:', err));
  }, []);

  const getStatusColor = (egf) => {
    return egf !== null ? 'text-black' : 'text-gray-400';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {DEVICE_TYPE_ORDER.map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type === filterType ? DEVICE_TYPES.ALL : type)} // 篩選按鈕高亮邏輯
            className={`px-3 py-1 rounded-full text-sm border ${
              type === filterType ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
            }`}
          >
            {DEVICE_TYPE_NAMES[type]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(deviceMapping).map(([areaKey, area]) => (
          <div key={areaKey}>
            <h2 className="text-2xl font-bold my-4">{area.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {area.devices.map(device => {
                const data = latestData[`WISE-4010LAN_${device.mac}`] || latestData[device.id];
                if (!data) return null;

                return device.sensors?.map((sensor, idx) => {
                  if (filterType !== DEVICE_TYPES.ALL && sensor.type !== filterType) return null;

                  const channels = sensor.channels.map(channel => {
                    const ch = data.channels?.[channel];
                    const egf = ch?.EgF ?? null;
                    return { channel, egf };
                  });

                  return (
                    <div key={(device.mac || device.id) + '-' + idx} className="border rounded-xl shadow p-4 bg-white">
                      <h3 className="text-xl font-semibold mb-2">{device.name}</h3>
                      <p className="text-gray-600 mb-2">
                        時間：{new Date(data.timestamp).toLocaleString('zh-TW')}
                      </p>

                      {/* 原本 channels 的顯示邏輯維持不變 */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-700">{sensor.name}</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {channels.map(({ channel, egf }) => (
                            <div key={channel} className="flex justify-between">
                              <span>{channel} EgF</span>
                              <span className={egf !== null ? 'text-black' : 'text-gray-400'}>
                                {egf !== null ? egf.toFixed(3) : '無'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <a href={`/trend?deviceId=${device.mac || device.id}&sensorIndex=${idx}`} className="text-blue-600 underline text-sm">
                          查看趨勢
                        </a>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home;
