// src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useParams, Outlet, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';
import InteractiveMap from './pages/InteractiveMap';
import TrendPage from './pages/TrendPage';

// 導航連結組件
const NavLink = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to) && (location.pathname === to || location.pathname.charAt(to.length) === '/');
  
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
  const { routeGroup } = useParams(); // 從 URL 獲取當前路線組
  
  // 根據當前 routeGroup 動態生成導航連結
  const baseNavPath = routeGroup ? `/${routeGroup}` : '';

  const getSiteName = () => {
    if (routeGroup === 't14') return '(台14線及甲線)';
    if (routeGroup === 't8') return '(台8線)';
    return '';
  };

  return (
    <nav className="bg-gradient-to-r from-blue-700 to-indigo-800 shadow-lg px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to={baseNavPath || "/"} className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>
            監測系統 {getSiteName()}
          </span>
        </Link>

        {/* 桌機版導航 */}
        <div className="hidden md:flex space-x-2">
          {/* ✨ NavLink 的 to 屬性使用 baseNavPath */}
          {/*    對於首頁，如果 baseNavPath 是 /t14，則 to="/t14/" (或 "/t14") */}
          <NavLink to={`${baseNavPath || '/'}`}>即時資料</NavLink>
          <NavLink to={`${baseNavPath}/history`}>歷史查詢</NavLink>
          <NavLink to={`${baseNavPath}/trend`}>趨勢圖</NavLink>
          <NavLink to={`${baseNavPath}/map`}>互動地圖</NavLink>
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
          <Link to={`${baseNavPath || '/'}`} className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            即時資料
          </Link>
          <Link to={`${baseNavPath}/history`} className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            歷史查詢
          </Link>
          <Link to={`${baseNavPath}/trend`} className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            趨勢圖
          </Link>
          <Link to={`${baseNavPath}/map`} className="text-white hover:bg-white/10 px-3 py-2 rounded-lg" onClick={() => setIsMenuOpen(false)}>
            互動地圖
          </Link>
        </div>
      )}
    </nav>
  );
};

// 創建 NotFoundPage 組件 (如果還沒有的話)
const NotFoundPage = () => (
    <div className="text-center py-10">
        <h1 className="text-4xl font-bold text-red-500">404 - 頁面未找到</h1>
        <p className="text-lg text-gray-600 mt-4">抱歉，您要找的頁面不存在。</p>
        <Link to="/" className="mt-6 inline-block bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600">返回首頁</Link>
    </div>
);

// 創建 SiteLayout 組件
const SiteLayout = () => {
    const { routeGroup } = useParams();
    
    // ✨ 驗證 routeGroup 是否有效
    if (routeGroup !== 't14' && routeGroup !== 't8') {
        // 如果 routeGroup 無效，可以重定向到預設路由或顯示 404
        // 這裡我們重定向到 /t14 作為預設，或者您可以顯示 NotFoundPage
        // return <Navigate to="/t14" replace />;
        return <NotFoundPage />; // 更明確的處理
    }

    return (
        <>
            <Navigation /> {/* Navigation 會從 URL params 獲取 routeGroup */}
            <div className="container mx-auto p-4 sm:p-6">
                <Outlet /> {/* 子路由 (Home, History 等) 會渲染在這裡 */}
            </div>
        </>
    );
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50">
        <Routes>
          {/* ✨ 巢狀路由結構 */}
          <Route path="/:routeGroup" element={<SiteLayout />}>
            <Route index element={<Home />} /> {/* 預設顯示 Home，例如 /t14/ */}
            <Route path="history" element={<History />} />
            {<Route path="trend/:deviceId/:sensorIndex" element={<TrendPage />} />}
            <Route path="map" element={<InteractiveMap />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} /> {/* 404 頁面 */}
        
          {/* ✨ 根路徑 "/" 的處理 */}
          <Route path="/" element={<Navigate to="/t14" replace />} /> {/* 預設跳轉到 /t14 */}
        </Routes>
        
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