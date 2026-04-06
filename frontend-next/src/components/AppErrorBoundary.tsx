'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  onError?: (error: Error, extra: { componentStack: string }) => void
}

interface State {
  hasError: boolean
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, { componentStack: errorInfo?.componentStack || '' })
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-[28px] border border-red-400/20 bg-[linear-gradient(180deg,rgba(55,17,24,0.92),rgba(17,10,16,0.9))] p-8 text-white shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/80">Application error</p>
          <h1 className="mt-4 text-3xl font-bold">This screen crashed.</h1>
          <p className="mt-4 text-sm leading-6 text-red-50/75">
            A report prompt should appear so you can send the error details to the admin inbox. You can retry this screen now or refresh the page if the issue persists.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
            >
              Retry screen
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/15"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
