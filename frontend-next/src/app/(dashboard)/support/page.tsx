'use client'

import { FormEvent, useEffect, useMemo, useState, useRef } from 'react'
import { LifeBuoy, MessageSquareWarning, Send, ChevronLeft, RefreshCw, User, ShieldCheck, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { errorReportAPI, userAPI } from '@/utils/api'
import { useAuthStore } from '@/store/auth'
import StatusBadge from '@/components/StatusBadge'

const ticketCategories = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'concern', label: 'Concern' },
  { value: 'complaint', label: 'Complaint' },
]

interface Ticket {
  id: string
  message: string
  status: string
  ticket_category?: string | null
  created_at: string
  reviewed_at?: string | null
  resolved_at?: string | null
}

interface TicketMessage {
  id: string
  author_type: 'user' | 'admin'
  author_email?: string | null
  body: string
  created_at: string
}

function formatDate(value?: string | null) {
  if (!value) return 'Unknown'
  const d = new Date(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SupportPage() {
  const { user } = useAuthStore()
  const [category, setCategory] = useState('feedback')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [sending, setSending] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [reply, setReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  
  // Mobile UI state
  const [mobileThreadView, setMobileThreadView] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedTicket = useMemo(
    () => tickets.find(t => t.id === selectedId),
    [tickets, selectedId]
  )

  const categoryLabel = useMemo(
    () => ticketCategories.find((entry) => entry.value === category)?.label || 'Support',
    [category]
  )

  const loadTickets = async (preferredId?: string | null) => {
    setLoadingTickets(true)
    try {
      const response = await userAPI.listSupportTickets()
      const nextTickets = Array.isArray(response.data) ? response.data : []
      setTickets(nextTickets)

      const desiredId = preferredId || selectedId
      if (desiredId && nextTickets.some((ticket: Ticket) => ticket.id === desiredId)) {
        setSelectedId(desiredId)
      } else {
        setSelectedId(nextTickets[0]?.id || null)
      }
    } catch {
      toast.error('Failed to load support tickets')
    } finally {
      setLoadingTickets(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }

    setLoadingMessages(true)
    userAPI.getSupportTicketMessages(selectedId)
      .then((response) => setMessages(response.data?.messages || []))
      .catch(() => toast.error('Failed to load ticket thread'))
      .finally(() => setLoadingMessages(false))
  }, [selectedId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loadingMessages])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!subject.trim()) return toast.error('Add a short subject')
    if (details.trim().length < 10) return toast.error('Add a bit more detail so we can help')

    setSending(true)
    try {
      const response = await errorReportAPI.create({
        reportKind: 'ticket',
        ticketCategory: category,
        source: 'dashboard',
        severity: 'info',
        message: subject.trim(),
        errorType: 'CustomerTicket',
        routePath: '/support',
        reporterEmail: email.trim() || undefined,
        context: {
          userDescription: details.trim(),
          submittedFrom: 'dashboard-support-page',
        },
      })

      toast.success(`${categoryLabel} ticket sent`)
      setSubject('')
      setDetails('')
      await loadTickets(response.data?.id || null)
      if (window.innerWidth < 1024) setMobileThreadView(true)
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send ticket'
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedId || sendingReply) return
    if (!reply.trim()) return toast.error('Reply cannot be empty')

    setSendingReply(true)
    try {
      const response = await userAPI.replyToSupportTicket(selectedId, reply.trim())
      setMessages((current) => [...current, response.data])
      setReply('')
      toast.success('Reply sent')
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send reply'
      toast.error(message)
    } finally {
      setSendingReply(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Hero Section */}
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Support</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Send feedback, concerns, or complaints.
            </h1>
            <p className="hero-copy mt-3">
              Replies from the admin team show up back here in the same thread.
            </p>
          </div>
          <div className="panel-soft p-4 sm:p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-100">
              <LifeBuoy className="h-4 w-4" />
              Shared operator inbox
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
              Include enough detail for follow-up. We attach your account context automatically.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        {/* New Ticket Form - Hidden on mobile if in thread view */}
        <form 
          onSubmit={handleSubmit} 
          className={`panel-soft p-5 sm:p-8 ${mobileThreadView ? 'hidden lg:block' : 'block'}`}
        >
          <p className="eyebrow mb-2">New Ticket</p>
          <h2 className="section-title">Open a discussion</h2>

          <div className="mt-6 space-y-5">
            <div>
              <label className="field-label">Category</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="field-select">
                {ticketCategories.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Subject</label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Short summary"
                className="field-input"
                maxLength={200}
              />
            </div>

            <div>
              <label className="field-label">Details</label>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Explain what happened..."
                className="field-input min-h-32"
              />
            </div>

            <button type="submit" disabled={sending} className="btn-primary w-full">
              <Send className="mr-2 inline h-4 w-4" />
              {sending ? 'Sending...' : 'Send Ticket'}
            </button>
          </div>
        </form>

        {/* Ticket List & Thread Container */}
        <div className="panel-soft flex flex-col overflow-hidden min-h-[600px] lg:h-[700px]">
          
          {/* List View - Hidden on mobile if in thread view */}
          <div className={`flex-1 flex flex-col ${mobileThreadView ? 'hidden lg:flex' : 'flex'}`}>
            <div className="p-5 sm:p-6 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <p className="eyebrow mb-1">Your Tickets</p>
                <h3 className="text-lg font-bold text-white">Recent conversations</h3>
              </div>
              <button 
                type="button" 
                onClick={() => loadTickets()} 
                className="p-2 rounded-full hover:bg-white/5 transition-colors text-slate-400"
              >
                <RefreshCw className={`h-5 w-5 ${loadingTickets ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingTickets ? (
                <div className="text-sm text-slate-400 p-4 text-center">Loading...</div>
              ) : tickets.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-500 mb-3">
                    <LifeBuoy className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-slate-400">No tickets yet.</p>
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(ticket.id)
                      if (window.innerWidth < 1024) setMobileThreadView(true)
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === ticket.id
                        ? 'border-brand-400/25 bg-brand-500/10'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="text-sm font-semibold text-white line-clamp-1">{ticket.message}</span>
                      <StatusBadge 
                        status={ticket.status === 'open' ? 'checking' : ticket.status === 'resolved' ? 'online' : 'unknown'} 
                        size="sm"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
                      {(ticket.ticket_category || 'ticket')} · {formatDate(ticket.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread View - Hidden on mobile if NOT in thread view */}
          <div className={`flex-1 flex flex-col bg-black/20 ${!mobileThreadView ? 'hidden lg:flex' : 'flex'}`}>
            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-sm text-slate-400">Select a ticket to read the conversation.</p>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div className="p-4 border-b border-white/[0.08] flex items-center gap-3 glass sticky top-0 z-10">
                  <button 
                    onClick={() => setMobileThreadView(false)}
                    className="lg:hidden p-2 -ml-2 rounded-full hover:bg-white/5"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{selectedTicket?.message}</h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                      {selectedTicket?.ticket_category || 'SUPPORT'} · {selectedId.slice(0, 8)}
                    </p>
                  </div>
                  <StatusBadge 
                    status={selectedTicket?.status === 'open' ? 'checking' : selectedTicket?.status === 'resolved' ? 'online' : 'unknown'} 
                    size="sm"
                  />
                </div>

                {/* Messages Container */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]"
                >
                  {loadingMessages ? (
                    <div className="text-sm text-slate-400 text-center py-4">Loading conversation...</div>
                  ) : (
                    <>
                      {/* Original Ticket Context as a System Message */}
                      <div className="flex justify-center my-6">
                        <div className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Ticket opened on {formatDate(selectedTicket?.created_at)}
                        </div>
                      </div>

                      {messages.map((message) => {
                        const isAdmin = message.author_type === 'admin'
                        return (
                          <div 
                            key={message.id} 
                            className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} animate-fade-in`}
                          >
                            <div className={`flex items-end gap-2 max-w-[85%] ${isAdmin ? 'flex-row' : 'flex-row-reverse'}`}>
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isAdmin ? 'bg-brand-500/20 text-brand-300' : 'bg-white/10 text-slate-400'
                              }`}>
                                {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                              </div>
                              <div className={`group relative p-3 sm:p-4 rounded-2xl ${
                                isAdmin 
                                  ? 'bg-surface-800 border border-white/10 rounded-bl-none text-slate-200' 
                                  : 'bg-brand-500 border border-brand-400/20 rounded-br-none text-white'
                              }`}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
                                <p className={`mt-1.5 text-[10px] opacity-50 ${isAdmin ? 'text-slate-400' : 'text-brand-50 text-right'}`}>
                                  {formatDate(message.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Status Change Interstitials */}
                      {selectedTicket?.reviewed_at && (
                        <div className="flex justify-center my-4">
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-[11px] text-amber-200/80 flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            Admin started reviewing on {formatDate(selectedTicket.reviewed_at)}
                          </div>
                        </div>
                      )}

                      {selectedTicket?.resolved_at && (
                        <div className="flex justify-center my-4">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-[11px] text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3" />
                            Ticket marked as resolved on {formatDate(selectedTicket.resolved_at)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reply Bar */}
                <form 
                  onSubmit={handleReply} 
                  className="p-4 border-t border-white/[0.08] glass flex items-end gap-2 sticky bottom-0"
                >
                  <div className="flex-1">
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Type your reply..."
                      className="field-input min-h-[48px] max-h-32 py-3 !rounded-[24px] resize-none overflow-y-auto"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleReply(e as any)
                        }
                      }}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={sendingReply || !reply.trim()} 
                    className="btn-primary !h-[48px] !w-[48px] !p-0 !rounded-full flex-shrink-0"
                  >
                    <Send className={`h-5 w-5 ${sendingReply ? 'animate-pulse' : ''}`} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Info Panel */}
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <MessageSquareWarning className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h4 className="font-bold text-white mb-2">How we use categories</h4>
            <p className="text-sm leading-7 text-slate-300/[0.72]">
              Use <strong className="text-white">Feedback</strong> for ideas or suggestions. 
              Use <strong className="text-white">Concern</strong> for bugs or technical issues. 
              Use <strong className="text-white">Complaint</strong> for account-specific problems or escalations.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
