import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, deviceMapping } from '../config/config';

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
  const [filterArea, setFilterArea] = useState('全部');

  useEffect(() => {
    axios.get(`${API_BASE}/api/latest`)
      .then(res => setLatestData(res.data))
      .catch(err => console.error('取得最新資料失敗:', err));
  }, []);

  const allAreas = ['全部', ...Object.values(deviceMapping).map(a => a.name)];

  return (
    <div className="space-y-4">
      {/* 區域選單 */}
      <div className="flex flex-wrap gap-2">
        {allAreas.map(name => (
          <button
            key={name}
            onClick={() => setFilterArea(name === filterArea ? '全部' : name)}
            className={`px-3 py-1 rounded-full text-sm border ${
              name === filterArea ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 資料區 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(deviceMapping)
          .filter(([_, area]) => filterArea === '全部' || area.name === filterArea)
          .map(([areaKey, area]) => (
          <div key={areaKey} className="md:col-span-4">
            <h2 className="text-2xl font-bold my-4">{area.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {area.devices.map(device => {
                const data = latestData[`WISE-4010LAN_${device.mac}`] || latestData[device.id];
                if (!data) return null;

                return device.sensors?.map((sensor, idx) => {
                  const channels = sensor.channels.map(channel => {
                    const ch = data.channels?.[channel];
                    const egf = ch?.EgF ?? null;
                    return { channel, egf };
                  });

                  return (
                    <div key={(device.mac || device.id) + '-' + idx} className="border rounded-xl shadow p-4 bg-white">
                      <h3 className="text-xl font-semibold mb-2">{device.name}</h3>
                      <p className="text-gray-600 mb-1">
                        時間：{new Date(data.timestamp).toLocaleString('zh-TW')}
                      </p>
                      <p className="text-gray-500 text-sm">
                        📅 更新於：{getRelativeTime(data.timestamp)}
                      </p>

                      <div className="space-y-2 mt-2">
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
