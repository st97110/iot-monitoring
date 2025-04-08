import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { deviceMapping } from '../config/deviceMapping';
import { DEVICE_TYPES, DEVICE_TYPE_NAMES, DEVICE_TYPE_ORDER } from '../config/constants';
import { API_BASE } from '../config/config';

function Home() {
  const [latestData, setLatestData] = useState({});
  const [filterType, setFilterType] = useState(DEVICE_TYPES.ALL);

  useEffect(() => {
    axios.get('${API_BASE}/api/latest')
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(latestData).map(([deviceId, data]) => {
          const mac = deviceId.split('_')[1];
          const config = deviceMapping[mac];
          if (!config) return null;

          return config.sensors.map((sensor, idx) => {
            if (filterType !== DEVICE_TYPES.ALL && sensor.type !== filterType) return null;

            const channels = sensor.channels.map(channel => {
              const ch = data.channels?.[channel];
              const egf = ch?.EgF ?? null;
              return { channel, egf };
            });

            return (
              <div key={deviceId + '-' + idx} className="border rounded-xl shadow p-4 bg-white">
                <h2 className="text-xl font-semibold mb-2">{config.name}</h2>
                <p className="text-gray-600 mb-2">
                  時間：{new Date(data.timestamp).toLocaleString('zh-TW', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </p>

                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-700">{sensor.name}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {channels.map(({ channel, egf }) => (
                      <div key={channel} className="flex justify-between">
                        <span>{channel} EgF</span>
                        <span className={getStatusColor(egf)}>
                          {egf !== null
                            ? new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3,
                              }).format(egf)
                            : '無'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <a
                    href={`/trend?mac=${mac}&sensor=${idx}`}
                    className="text-blue-600 underline text-sm"
                  >
                    查看趨勢
                  </a>
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

export default Home;
