import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Server, Film, Tv2, Settings, User, Menu, X, LogOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import BrandMark from './BrandMark';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const baseNavItems = [
  { path: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { path: '/providers', label: 'Providers', mobileLabel: 'Sources', icon: Server },
  { path: '/vod', label: 'Browse VOD', mobileLabel: 'VOD', icon: Film },
  { path: '/live', label: 'Live TV', mobileLabel: 'Live', icon: Tv2 },
  { path: '/addon', label: 'Addon', mobileLabel: 'Addon', icon: Settings },
  { path: '/account', label: 'Account', mobileLabel: 'Account', icon: User },
];

function SidebarNavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-brand-500/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-brand-400/20'
            : 'text-slate-300/65 hover:bg-white/[0.05] hover:text-white border border-transparent'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-150',
            isActive
              ? 'border-brand-400/30 bg-brand-400/15 text-brand-300'
              : 'border-white/[0.08] bg-white/[0.03] text-slate-400 group-hover:border-white/15 group-hover:text-slate-200'
          )}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="truncate">{label}</span>
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeBtnRef = useRef(null);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

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

  const navItems = baseNavItems.filter((item) => {
    if (item.path === '/live') return Boolean(user?.can_use_live_tv);
    if (item.path === '/vod') {
      return Boolean(
        user?.canBrowseWebCatalog
        ?? user?.can_browse_web_catalog
        ?? user?.has_byo_providers
        ?? user?.has_active_free_access
      );
    }
    return true;
  });

  return (
    <div className="app-shell">
      <div className="app-chrome flex min-h-screen">

        {/* ── Sidebar ── */}
        <aside
          id="sidebar"
          aria-label="Workspace navigation"
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[17rem] border-r border-white/[0.08] bg-surface-900/90 backdrop-blur-2xl',
            'transform transition-transform duration-300 ease-out will-change-transform',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:translate-x-0 lg:static lg:w-[17rem]',
            'flex flex-col'
          )}
        >
          {/* Brand */}
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4">
            <BrandMark compact />
            <button
              ref={closeBtnRef}
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-white transition-colors lg:hidden"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Workspace">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Workspace
            </p>
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

          {/* User footer */}
          <div className="border-t border-white/[0.08] p-3 space-y-2">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">Signed in as</p>
              <p className="break-all text-sm font-medium text-white truncate">{user?.email}</p>
              <p className="mt-0.5 text-xs text-slate-300/45">Secure routing & addon management</p>
            </div>
            <Button
              variant="destructive"
              className="w-full rounded-2xl"
              onClick={handleLogout}
              size="sm"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* ── Overlay ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        {/* ── Main content ── */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">

          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.08] bg-surface-950/70 px-4 py-3 backdrop-blur-xl lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
            >
              <Menu className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <BrandMark compact />
          </header>

          {/* Page content */}
          <main className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="mx-auto w-full max-w-[104rem] px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-8"
            >
              {children}
            </motion.div>
          </main>

          {/* Mobile bottom nav */}
          <nav
            className="fixed inset-x-3 bottom-3 z-30 overflow-x-auto rounded-[26px] border border-white/[0.08] bg-surface-900/92 px-2 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:hidden"
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
                        cn(
                          'flex min-w-[60px] flex-col items-center gap-1 rounded-[18px] px-2.5 py-2 text-[10px] font-semibold transition-all',
                          isActive
                            ? 'bg-brand-500/15 text-brand-300 border border-brand-400/20'
                            : 'text-slate-300/55 hover:text-slate-200 border border-transparent'
                        )
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
