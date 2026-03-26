import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bars3Icon,
  HomeIcon,
  ServerIcon,
  FilmIcon,
  Cog6ToothIcon,
  UserIcon,
  SparklesIcon
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

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'text-slate-300/[0.72] hover:bg-white/[0.04] hover:text-white'
        }`
      }
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <div className="app-chrome flex min-h-screen">
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[18.5rem] border-r border-white/10 bg-surface-900/80 backdrop-blur-2xl
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:w-[18.5rem]
        flex flex-col
      `}>
        <div className="border-b border-white/10 px-6 py-7">
          <BrandMark compact />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <p className="eyebrow px-3 pb-3">Workspace</p>
          <div className="space-y-2">
          {navItems.map(item => (
            <NavItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
          </div>
        </nav>

        <div className="border-t border-white/10 px-4 py-5">
          <div className="panel-soft px-4 py-4">
            <p className="eyebrow mb-2">Signed In</p>
            <p className="break-all text-sm font-medium text-white">{user?.email}</p>
            <p className="mt-1 text-xs text-slate-300/60">Secure catalog routing and addon management</p>
          </div>
          <button
            onClick={handleLogout}
            className="btn-danger mt-4 w-full"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-surface-950/[0.65] px-4 py-4 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-slate-100 transition-colors hover:bg-white/[0.08]"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <BrandMark compact />
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[108rem] px-4 py-5 pb-24 sm:px-6 lg:px-10 lg:py-8 lg:pb-8">
            <div className="animate-fade-in">
            {children}
            </div>
          </div>
        </main>

        <nav className="fixed inset-x-3 bottom-3 z-30 overflow-x-auto rounded-[28px] border border-white/10 bg-surface-900/88 px-2 py-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:hidden">
          <div className="flex min-w-max gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-medium transition ${
                      isActive ? 'bg-white/[0.08] text-white' : 'text-slate-300/65'
                    }`
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{item.mobileLabel || item.label.replace('Browse ', '')}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
      </div>
    </div>
  );
}
