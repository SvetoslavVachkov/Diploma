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
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navContent}>
          <Link to="/" style={styles.logo}>
            SmartBudget
          </Link>
          <div style={styles.navLinks}>
            <Link
              to="/"
              style={{
                ...styles.navLink,
                ...(isActive('/') ? styles.navLinkActive : {})
              }}
            >
              Начало
            </Link>
            <Link
              to="/transactions"
              style={{
                ...styles.navLink,
                ...(isActive('/transactions') ? styles.navLinkActive : {})
              }}
            >
              Транзакции
            </Link>
            <Link
              to="/goals"
              style={{
                ...styles.navLink,
                ...(isActive('/goals') ? styles.navLinkActive : {})
              }}
            >
              Цели
            </Link>
            <Link
              to="/reports"
              style={{
                ...styles.navLink,
                ...(isActive('/reports') ? styles.navLinkActive : {})
              }}
            >
              Отчети
            </Link>
            <Link
              to="/news"
              style={{
                ...styles.navLink,
                ...(isActive('/news') ? styles.navLinkActive : {})
              }}
            >
              Новини
            </Link>
            <Link
              to="/ai-chat"
              style={{
                ...styles.navLink,
                ...(isActive('/ai-chat') ? styles.navLinkActive : {})
              }}
            >
              AI Чат
            </Link>
          </div>
          <div style={styles.userSection}>
            <span style={styles.userName}>
              {user?.first_name} {user?.last_name}
            </span>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Изход
            </button>
          </div>
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
  },
  nav: {
    background: 'white',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    padding: '0 20px'
  },
  navContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '70px'
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textDecoration: 'none'
  },
  navLinks: {
    display: 'flex',
    gap: '30px'
  },
  navLink: {
    color: '#666',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: '500',
    padding: '8px 16px',
    borderRadius: '8px',
    transition: 'all 0.3s'
  },
  navLinkActive: {
    color: '#667eea',
    background: '#f0f0ff'
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  },
  userName: {
    color: '#333',
    fontWeight: '500'
  },
  logoutButton: {
    padding: '8px 20px',
    background: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    transition: 'all 0.3s'
  },
  main: {
    flex: 1,
    padding: '30px 20px',
    maxWidth: '1400px',
    width: '100%',
    margin: '0 auto'
  }
};

export default Layout;

