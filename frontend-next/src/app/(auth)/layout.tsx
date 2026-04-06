import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { template: '%s | StreamBridge', default: 'StreamBridge' },
  robots: { index: true, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
