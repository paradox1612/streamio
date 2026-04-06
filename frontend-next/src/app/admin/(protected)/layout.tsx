export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen app-shell"><div className="app-chrome">{children}</div></div>
}
