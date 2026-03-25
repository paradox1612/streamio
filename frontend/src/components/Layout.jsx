import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/dashboard', label: 'Overview', icon: '📊' },
  { path: '/providers', label: 'Providers', icon: '🔌' },
  { path: '/vod', label: 'VOD Browser', icon: '🎬' },
  { path: '/addon', label: 'Addon Settings', icon: '🔗' },
  { path: '/account', label: 'Account', icon: '👤' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0f172a', color: '#f1f5f9' }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex`}
        style={{ background: '#1e293b', borderRight: '1px solid #334155' }}>

        {/* Logo */}
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid #334155' }}>
            <span style={{ fontSize: '1.5rem' }}>🌉</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#818cf8' }}>StreamBridge</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {navItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '8px',
                    fontSize: '0.9rem', fontWeight: active ? 600 : 400,
                    background: active ? '#312e81' : 'transparent',
                    color: active ? '#c7d2fe' : '#94a3b8',
                    textDecoration: 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="px-4 py-4" style={{ borderTop: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px' }}>
              Signed in as
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px', wordBreak: 'break-all' }}>
              {user?.email}
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '8px', borderRadius: '8px',
                background: '#7f1d1d', color: '#fca5a5',
                border: 'none', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 0 }}>
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3"
          style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
          >
            ☰
          </button>
          <span style={{ fontWeight: 700, color: '#818cf8' }}>StreamBridge</span>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
