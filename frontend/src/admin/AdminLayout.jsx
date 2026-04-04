import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

const navItems = [
  { path: '/admin/dashboard', label: 'Overview', icon: '📊' },
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/providers', label: 'Providers', icon: '🔌' },
  { path: '/admin/free-access', label: 'Free Access', icon: '🎁' },
  { path: '/admin/health', label: 'Host Health', icon: '🩺' },
  { path: '/admin/tmdb', label: 'TMDB Matching', icon: '🎯' },
  { path: '/admin/system', label: 'System', icon: '⚙️' },
];

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await adminAPI.logout(); } catch (_) {}
    localStorage.removeItem('sb_admin_token');
    toast.success('Admin logged out');
    navigate('/admin/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0f172a', color: '#f1f5f9' }}>
      <aside style={{ width: '220px', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🛡️</span>
          <span style={{ fontWeight: 700, color: '#818cf8', fontSize: '0.95rem' }}>Admin Panel</span>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: active ? 600 : 400, background: active ? '#312e81' : 'transparent', color: active ? '#c7d2fe' : '#94a3b8', textDecoration: 'none', marginBottom: '2px', transition: 'all 0.15s' }}>
                <span>{item.icon}</span> {item.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '1px solid #334155' }}>
          <Link to="/dashboard" style={{ display: 'block', padding: '8px 12px', fontSize: '0.8rem', color: '#64748b', textDecoration: 'none', marginBottom: '4px' }}>← User Dashboard</Link>
          <button onClick={handleLogout} style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Sign Out</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
