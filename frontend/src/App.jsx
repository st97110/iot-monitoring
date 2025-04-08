// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';
import InteractiveMap from './pages/InteractiveMap';
import TrendPage from './pages/TrendPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow px-6 py-4 flex justify-between">
          <h1 className="text-xl font-bold">監測系統</h1>
          <div className="space-x-4">
            <Link to="/" className="text-blue-600 hover:underline">即時資料</Link>
            <Link to="/history" className="text-blue-600 hover:underline">歷史查詢</Link>
            <Link to="/trend" className="text-blue-600 hover:underline">趨勢圖</Link>
            <Link to="/map" className="text-blue-600 hover:underline">互動地圖</Link>
          </div>
        </nav>

        <div className="p-6">
          <Routes>
            <Route path="/map" element={<InteractiveMap />} />
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<History />} />
            <Route path="/trend" element={<TrendPage />} />
            <Route path="/trend/:deviceId/:sensorIndex" element={<TrendPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
