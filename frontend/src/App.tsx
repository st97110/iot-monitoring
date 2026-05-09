// src/App.tsx
import { useState, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink as RouterNavLink, useLocation, useParams, Outlet, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import History from './pages/History';
import InteractiveMap from './pages/InteractiveMap';
import TrendPage from './pages/TrendPage';

// 導航連結組件（目前未使用但保留，以便日後擴充）
interface NavLinkProps {
  to: string;
  children: ReactNode;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _NavLink = ({ to, children }: NavLinkProps) => {
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
  const { routeGroup } = useParams<{ routeGroup?: string }>();

  const baseNavPath = routeGroup ? `/${routeGroup}` : '';

  const getSiteName = (): string => {
    if (routeGroup === 't14') return '(台14線及甲線)';
    if (routeGroup === 't8') return '(台8線)';
    return '';
  };

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `px-4 py-2 rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-white text-blue-700 shadow-md font-medium'
        : 'text-white/80 hover:text-white hover:bg-white/10'
    }`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }): string =>
    `px-3 py-2 rounded-lg ${isActive ? 'bg-white/20' : ''} text-white hover:bg-white/10`;

  return (
    <nav className="bg-gradient-to-r from-blue-700 to-indigo-800 shadow-lg px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to={baseNavPath || '/'} className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>監測系統 {getSiteName()}</span>
        </Link>

        {/* 桌機版導航 */}
        <div className="hidden md:flex space-x-2">
          <RouterNavLink to={`${baseNavPath || '/'}`} end className={linkClass}>即時資料</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/history`} className={linkClass}>歷史查詢</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/trend`} className={linkClass}>趨勢圖</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/map`} className={linkClass}>互動地圖</RouterNavLink>
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
          <RouterNavLink to={`${baseNavPath || '/'}`} end className={mobileLinkClass} onClick={() => setIsMenuOpen(false)}>即時資料</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/history`} className={mobileLinkClass} onClick={() => setIsMenuOpen(false)}>歷史查詢</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/trend`} className={mobileLinkClass} onClick={() => setIsMenuOpen(false)}>趨勢圖</RouterNavLink>
          <RouterNavLink to={`${baseNavPath}/map`} className={mobileLinkClass} onClick={() => setIsMenuOpen(false)}>互動地圖</RouterNavLink>
        </div>
      )}
    </nav>
  );
};

const NotFoundPage = () => (
  <div className="text-center py-10">
    <h1 className="text-4xl font-bold text-red-500">404 - 頁面未找到</h1>
    <p className="text-lg text-gray-600 mt-4">抱歉，您要找的頁面不存在。</p>
    <Link to="/" className="mt-6 inline-block bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600">返回首頁</Link>
  </div>
);

const SiteLayout = () => {
  const { routeGroup } = useParams<{ routeGroup?: string }>();
  if (routeGroup !== 't14' && routeGroup !== 't8') {
    return <NotFoundPage />;
  }
  return (
    <>
      <Navigation />
      <Outlet />
    </>
  );
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="flex-1">
          <Routes>
            <Route path="/:routeGroup" element={<SiteLayout />}>
              <Route index element={<Home />} />
              <Route path="history" element={<History />} />
              <Route path="trend" element={<TrendPage />} />
              <Route path="map" element={<InteractiveMap />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
            <Route path="/" element={<Navigate to="/t14" replace />} />
          </Routes>
        </div>

        <footer className="text-center text-xs text-slate-400 py-4 border-t border-slate-200 bg-white/50">
          © {new Date().getFullYear()} 監測系統 · 連鈾工程
        </footer>
      </div>
    </Router>
  );
}

export default App;
