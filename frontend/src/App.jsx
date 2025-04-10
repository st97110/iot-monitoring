// src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';
import InteractiveMap from './pages/InteractiveMap';
import TrendPage from './pages/TrendPage';

// 導航連結組件
const NavLink = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-white text-blue-700 shadow-md font-medium'
          : 'text-white/80 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </Link>
  );
};

// 導航列組件
const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <nav className="bg-gradient-to-r from-blue-700 to-indigo-800 shadow-lg px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>監測系統</span>
        </h1>
        
        {/* 桌面版導航 */}
        <div className="hidden md:flex space-x-2">
          <NavLink to="/">即時資料</NavLink>
          <NavLink to="/history">歷史查詢</NavLink>
          <NavLink to="/trend">趨勢圖</NavLink>
          <NavLink to="/map">互動地圖</NavLink>
        </div>
        
        {/* 行動版選單按鈕 */}
        <button 
          className="md:hidden text-white focus:outline-none"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
      </div>
      
      {/* 行動版選單 */}
      {isMenuOpen && (
        <div className="mt-3 md:hidden flex flex-col space-y-2 px-2 pb-3 pt-2">
          <Link to="/" className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            即時資料
          </Link>
          <Link to="/history" className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            歷史查詢
          </Link>
          <Link to="/trend" className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            趨勢圖
          </Link>
          <Link to="/map" className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            互動地圖
          </Link>
        </div>
      )}
    </nav>
  );
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50">
        <Navigation />

        <div className="container mx-auto p-4 sm:p-6">
          <Routes>
            <Route path="/map" element={<InteractiveMap />} />
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<History />} />
            <Route path="/trend" element={<TrendPage />} />
            <Route path="/trend/:deviceId/:sensorIndex" element={<TrendPage />} />
          </Routes>
        </div>
        
        {/* 頁腳 */}
        <footer className="bg-gradient-to-r from-gray-800 to-gray-900 text-white mt-8 py-6">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <h3 className="text-lg font-bold">監測系統儀表板</h3>
                <p className="text-gray-400 text-sm mt-1">即時監控各類感測器數據</p>
              </div>
              <div className="flex space-x-4">
                <Link to="/" className="text-gray-300 hover:text-white">首頁</Link>
                <Link to="/history" className="text-gray-300 hover:text-white">歷史資料</Link>
                <Link to="/map" className="text-gray-300 hover:text-white">互動地圖</Link>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700 text-center text-gray-400 text-sm">
              © {new Date().getFullYear()} 監測系統. 保留所有權利.
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;