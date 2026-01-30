import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="app-shell">
      <nav className="nav">
        <div className="nav-inner">
          <Link to="/" className="logo">
            SmartBudget
          </Link>
          <div className="nav-links">
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
              Начало
            </Link>
            <Link to="/transactions" className={`nav-link ${isActive('/transactions') ? 'active' : ''}`}>
              Транзакции
            </Link>
            <Link to="/goals" className={`nav-link ${isActive('/goals') ? 'active' : ''}`}>
              Цели
            </Link>
            <Link to="/reports" className={`nav-link ${isActive('/reports') ? 'active' : ''}`}>
              Отчети
            </Link>
            <Link to="/news" className={`nav-link ${isActive('/news') ? 'active' : ''}`}>
              Новини
            </Link>
            <Link to="/ai-chat" className={`nav-link ${isActive('/ai-chat') ? 'active' : ''}`}>
              AI Чат
            </Link>
          </div>
          <div className="nav-user">
            <span>{user?.first_name} {user?.last_name}</span>
            <button type="button" onClick={handleLogout} className="btn btn-logout">
              Изход
            </button>
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
};

export default Layout;
