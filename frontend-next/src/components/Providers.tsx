'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState } from 'react'
import { ErrorReportingProvider } from '@/context/ErrorReportingContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30 * 1000, retry: 1 },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorReportingProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(8, 16, 31, 0.92)',
              color: '#edf4ff',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(18px)',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#f1f5f9' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
          }}
        />
      </ErrorReportingProvider>
    </QueryClientProvider>
  )
}
