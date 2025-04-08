import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import { API_BASE, deviceMapping } from '../config/config';

function TrendPage() {
    const [mac, setMac] = useState('');
    const [sensorIndex, setSensorIndex] = useState(0);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [data, setData] = useState([]);

    const [searchParams] = useSearchParams();

    useEffect(() => {
        const macParam = searchParams.get('mac');
        const sensorIndexParm = parseInt(searchParams.get('sensorIndex') || '0');
        if(macParam) {
            setMac(macParam);
            setSensorIndex(sensorIndexParm);
        }

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setStartDate(weekAgo);
        setEndDate(today);
    }, []);

    useEffect(() => {
        if (mac && startDate && endDate) {
            handleSearch();
        }
    }, [mac, sensorIndex, startDate, endDate]);

    const allDevices = Object.values(deviceMapping).flatMap(area => area.devices);
    const currentDevice = allDevices.find(dev => dev.mac === mac || dev.id === mac);

    const handleSearch = async () => {
        if (!mac) return;

        const deviceId = 'WISE-4010LAN_' + mac;
        const sensor = deviceMapping[mac]?.sensors?.[sensorIndex];
        if (!sensor) return;

        try {
        const res = await axios.get(`${API_BASE}/api/history`, {
            params: { deviceId, startDate, endDate }
        });

        const raw = res.data;

        const processed = raw.map(entry => {
            const row = { time: entry.timestamp };
            for (const ch of sensor.channels) {
            const egf = entry.channels?.[ch]?.EgF;
            if (egf !== undefined) {
                const init = sensor.initialValues?.[ch] ?? 0;
                row[ch] = egf - init;
            }
            }
            return row;
        });

        setData(processed);
        } catch (err) {
        console.error('取得趨勢資料錯誤:', err);
        }
    };

    const applyRange = (days) => {
        const end = new Date();
        const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
      
        const format = (d) => d.toISOString().split('T')[0];
        setStartDate(format(start));
        setEndDate(format(end));
      
        setOffset(0); // 回到第一頁
    };

    return (
        <div className="max-w-5xl mx-auto p-4 space-y-6">
            <h1 className="text-2xl font-bold">趨勢圖查詢</h1>

            <div className="flex gap-2 mb-4">
                <button onClick={() => applyRange(1)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一天</button>
                <button onClick={() => applyRange(7)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一週</button>
                <button onClick={() => applyRange(30)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">最近一個月</button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
                <div>
                    <label className="font-semibold">裝置：</label>
                    <select value={mac} onChange={e => setMac(e.target.value)} className="w-full border rounded p-2">
                        <option value="">請選擇</option>
                        {allDevices.map(dev => (
                            <option key={dev.mac || dev.id} value={dev.mac || dev.id}>{dev.name}</option>
                        ))}
                    </select>
                </div>

                {mac && (
                    <div>
                        <label className="font-semibold">通道組：</label>
                        <select value={sensorIndex} onChange={e => setSensorIndex(parseInt(e.target.value))} className="w-full border rounded p-2">
                        {currentDevice.sensors?.map((s, i) => (
                            <option key={i} value={i}>{s.name}</option>
                        ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="font-semibold">開始日期：</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded p-2" />
                </div>
                <div>
                    <label className="font-semibold">結束日期：</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded p-2" />
                </div>
            </div>

            <button onClick={handleSearch} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                顯示趨勢
            </button>

            {data.length > 0 && (
                <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data}>
                    <XAxis
                    dataKey="time"
                    tickFormatter={(val) =>
                        new Date(val).toLocaleString('zh-TW', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        })
                    }
                    />
                    <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(value) =>
                        new Intl.NumberFormat('en-US', {
                        maximumFractionDigits: 3,
                        }).format(value)
                    }
                    />
                    <Tooltip
                    formatter={(value) =>
                        new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3,
                        }).format(value)
                    }
                    />
                    <Legend />
                    {currentDevice?.sensors?.[sensorIndex]?.channels.map((ch, i) => (
                    <Line
                        key={ch}
                        dataKey={ch}
                        type="monotone"
                        stroke={i === 0 ? '#8884d8' : '#82ca9d'}
                        dot={false}
                    />
                    ))}
                </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}

export default TrendPage;
``