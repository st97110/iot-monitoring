import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

function StationDetail() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const limit = 10;

  const fetchData = async (page = 0, start = '', end = '') => {
    try {
      const params = { deviceId: id, limit, offset: page * limit };
      if (start && end) {
        params.startDate = start;
        params.endDate = end;
      }

      const res = await axios.get('http://localhost:3000/api/history', { params });
      setData(res.data);
    } catch (err) {
      console.error('載入資料失敗', err);
    }
  };

  useEffect(() => {
    fetchData(page, startDate, endDate);
  }, [id, page]);

  const handleSearch = () => {
    setPage(0); // 重設回第一頁
    fetchData(0, startDate, endDate);
  };

  const getStatusColor = (egf) => {
    if (egf > 10 || egf < -10) return 'text-red-600';
    if (Math.abs(egf) > 5) return 'text-yellow-500';
    return 'text-green-600';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">站點：{id}</h1>

      <div className="flex gap-4 items-center">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded" />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded" />
        <button onClick={handleSearch} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">查詢</button>
      </div>

      {data.length === 0 ? (
        <p>無資料</p>
      ) : (
        <div className="space-y-4">
          {data.map((entry, idx) => (
            <div key={idx} className="border p-4 rounded bg-white shadow">
              <h3 className="font-semibold text-gray-800 mb-2">時間：{entry.timestamp}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(entry.channels || {}).map(([channel, val]) => (
                  <div key={channel} className="flex justify-between">
                    <span>{channel} EgF</span>
                    <span className={getStatusColor(val.EgF)}>{val.EgF ?? '無'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={() => setPage(p => Math.max(p - 1, 0))}
          className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
          disabled={page === 0}
        >
          上一頁
        </button>
        <span>第 {page + 1} 頁</span>
        <button
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
          disabled={data.length < limit}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}

export default StationDetail;
