import type { Metadata } from 'next'
import DashboardLayout from '@/components/DashboardLayout'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: { template: '%s | StreamBridge', default: 'Dashboard | StreamBridge' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>
}
