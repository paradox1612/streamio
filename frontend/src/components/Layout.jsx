import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bars3Icon,
  HomeIcon,
  ServerIcon,
  FilmIcon,
  Cog6ToothIcon,
  UserIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import BrandMark from './BrandMark';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: HomeIcon },
  { path: '/providers', label: 'Providers', mobileLabel: 'Sources', icon: ServerIcon },
  { path: '/vod', label: 'Browse VOD', mobileLabel: 'VOD', icon: FilmIcon },
  { path: '/live', label: 'Live TV', mobileLabel: 'Live', icon: SparklesIcon },
  { path: '/addon', label: 'Addon', mobileLabel: 'Addon', icon: Cog6ToothIcon },
  { path: '/account', label: 'Account', mobileLabel: 'Account', icon: UserIcon },
];

function SidebarNavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-slate-300/70 hover:bg-white/[0.04] hover:text-white'
        }`
      }
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeBtnRef = useRef(null);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Lock body scroll when sidebar open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      closeBtnRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <div className="app-chrome flex min-h-screen">

        {/* ── Sidebar ── */}
        <aside
          id="sidebar"
          aria-label="Workspace navigation"
          className={`
            fixed inset-y-0 left-0 z-50 w-[17rem] border-r border-white/10 bg-surface-900/85 backdrop-blur-2xl
            transform transition-transform duration-300 ease-out will-change-transform
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:translate-x-0 lg:static lg:w-[17rem]
            flex flex-col
          `}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
            <BrandMark compact />
            <button
              ref={closeBtnRef}
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 hover:bg-white/[0.08] lg:hidden"
              aria-label="Close navigation menu"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Workspace">
            <p className="eyebrow px-4 pb-3">Workspace</p>
            <ul className="space-y-1" role="list">
              {navItems.map((item) => (
                <li key={item.path}>
                  <SidebarNavItem
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                    onClick={() => setSidebarOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-white/10 p-3">
            <div className="panel-soft px-4 py-3.5">
              <p className="eyebrow mb-1.5">Signed in as</p>
              <p className="break-all text-sm font-medium text-white">{user?.email}</p>
              <p className="mt-0.5 text-xs text-slate-300/55">Secure routing &amp; addon management</p>
            </div>
            <button
              onClick={handleLogout}
              className="btn-danger mt-3 w-full"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Overlay ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── Main content ── */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">

          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-surface-950/70 px-4 py-3.5 backdrop-blur-xl lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-100 hover:bg-white/[0.08]"
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
            >
              <Bars3Icon className="h-5 w-5" aria-hidden="true" />
            </button>
            <BrandMark compact />
          </header>

          {/* Page content */}
          <main className="relative z-10 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[104rem] px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
              <div className="animate-fade-in">
                {children}
              </div>
            </div>
          </main>

          {/* Mobile bottom nav */}
          <nav
            className="fixed inset-x-3 bottom-3 z-30 overflow-x-auto rounded-[26px] border border-white/10 bg-surface-900/90 px-2 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:hidden"
            aria-label="Mobile navigation"
          >
            <ul className="flex min-w-max gap-1" role="list">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        `flex min-w-[64px] flex-col items-center gap-1 rounded-[18px] px-2.5 py-2 text-[10px] font-semibold transition-colors ${
                          isActive
                            ? 'bg-white/[0.08] text-white'
                            : 'text-slate-300/60 hover:text-slate-200'
                        }`
                      }
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{item.mobileLabel || item.label.replace('Browse ', '')}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
