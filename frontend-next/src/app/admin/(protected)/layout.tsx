'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Crosshair,
  FileText,
  Gift,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  OctagonAlert,
  PlugZap,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { persistAdminToken } from '@/lib/auth-cookies'

const navItems = [
  { path: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, description: 'System posture' },
  { path: '/admin/blog', label: 'Blog', icon: FileText, description: 'Publishing workflow' },
  { path: '/admin/users', label: 'Users', icon: Users, description: 'Access and lifecycle' },
  { path: '/admin/providers', label: 'Providers', icon: PlugZap, description: 'Catalog sources' },
  { path: '/admin/free-access', label: 'Free Access', icon: Gift, description: 'Promotions and trials' },
  { path: '/admin/health', label: 'Host Health', icon: HeartPulse, description: 'Routing confidence' },
  { path: '/admin/errors', label: 'Errors', icon: OctagonAlert, description: 'Crash reports' },
  { path: '/admin/tmdb', label: 'TMDB Matching', icon: Crosshair, description: 'Catalog integrity' },
  { path: '/admin/system', label: 'System', icon: Settings, description: 'Infrastructure' },
]

function AdminNavItem({ item, onClick }: { item: (typeof navItems)[number]; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === item.path || pathname.startsWith(item.path + '/')
  const Icon = item.icon

  return (
    <Link
      href={item.path}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 rounded-[22px] border px-3 py-3 transition-all duration-200',
        isActive
          ? 'border-brand-400/25 bg-brand-500/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'border-transparent bg-transparent text-slate-300/70 hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-white'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border transition-colors',
          isActive
            ? 'border-brand-400/25 bg-brand-500/12 text-brand-200'
            : 'border-white/[0.08] bg-white/[0.04] text-slate-400 group-hover:text-slate-100'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{item.label}</span>
        <span className="block truncate text-xs text-slate-400/75">{item.description}</span>
      </span>
    </Link>
  )
}

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
      closeButtonRef.current?.focus()
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const handleLogout = async () => {
    try { await adminAPI.logout() } catch { /* ignore */ }
    localStorage.removeItem('sb_admin_token')
    persistAdminToken(null)
    toast.success('Admin logged out')
    router.push('/admin/login')
  }

  return (
    <div className="app-shell">
      <div className="app-chrome flex min-h-screen">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[20rem] flex-col border-r border-white/[0.08] bg-surface-900/88 px-4 py-4 backdrop-blur-2xl transition-transform duration-300 lg:static lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-brand-400/20 bg-brand-500/12 shadow-[0_18px_44px_rgba(20,145,255,0.18)]">
                <Shield className="h-5 w-5 text-brand-200" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">StreamBridge</p>
                <h1 className="text-lg font-bold text-white">Admin control plane</h1>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white lg:hidden"
              aria-label="Close admin navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/85">Control scope</p>
            <p className="mt-2 text-sm text-slate-200">Users, providers, routing health, and catalog operations.</p>
          </div>

          <nav className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
            {navItems.map((item) => (
              <AdminNavItem key={item.path} item={item} onClick={() => setSidebarOpen(false)} />
            ))}
          </nav>

          <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
            <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to user app
              </Link>
            </Button>
            <Button variant="destructive" className="w-full justify-start rounded-2xl" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close admin navigation overlay"
          />
        )}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.08] bg-surface-950/72 px-4 py-3 backdrop-blur-xl lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Open admin navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/70">StreamBridge</p>
              <p className="text-sm font-semibold text-white">Admin</p>
            </div>
          </header>

          <main className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[112rem] px-4 py-5 pb-10 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
