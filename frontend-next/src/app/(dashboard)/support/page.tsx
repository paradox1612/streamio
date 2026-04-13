'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { LifeBuoy, MessageSquareWarning, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { errorReportAPI, userAPI } from '@/utils/api'
import { useAuthStore } from '@/store/auth'

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
}

interface TicketMessage {
  id: string
  author_type: 'user' | 'admin'
  author_email?: string | null
  body: string
  created_at: string
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Unknown'
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
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Support</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Send feedback, concerns, or complaints without leaving the dashboard.
            </h1>
            <p className="hero-copy mt-3">
              Tickets land in the shared operator inbox, and replies from the admin team show up back here in the same thread.
            </p>
          </div>
          <div className="panel-soft p-4 sm:p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-100">
              <LifeBuoy className="h-4 w-4" />
              Shared operator inbox
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
              Include a short subject and enough detail for follow-up. We attach your account context automatically when available.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={handleSubmit} className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">New Ticket</p>
          <h2 className="section-title">Tell the team what happened</h2>

          <div className="mt-6 space-y-5">
            <div>
              <label className="field-label">Category</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="field-input">
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
                placeholder="Short summary of the issue"
                className="field-input"
                maxLength={200}
              />
            </div>

            <div>
              <label className="field-label">Details</label>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Explain what happened, what you expected, and anything else the team should check."
                className="field-input min-h-40"
              />
            </div>

            <div>
              <label className="field-label">Contact email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="field-input"
              />
            </div>

            <button type="submit" disabled={sending} className="btn-primary w-full sm:w-auto">
              <Send className="mr-2 inline h-4 w-4" />
              {sending ? 'Sending ticket...' : 'Send Ticket'}
            </button>
          </div>
        </form>

        <div className="panel-soft p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Ticket Thread</p>
              <h2 className="section-title">Replies and updates</h2>
            </div>
            <button type="button" onClick={() => loadTickets()} className="btn-secondary px-4 py-2 text-sm">
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-3">
              {loadingTickets ? (
                <div className="text-sm text-slate-400">Loading tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-400">
                  No tickets yet. Submit one from the form to start a conversation.
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      selectedId === ticket.id
                        ? 'border-brand-400/25 bg-brand-500/10'
                        : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">{ticket.message}</span>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {ticket.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {(ticket.ticket_category || 'ticket').toUpperCase()} · {formatDate(ticket.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="space-y-4">
              {!selectedId ? (
                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-400">
                  Select a ticket to read the conversation.
                </div>
              ) : (
                <>
                  <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                    {loadingMessages ? (
                      <div className="text-sm text-slate-400">Loading conversation...</div>
                    ) : messages.length === 0 ? (
                      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-400">
                        No replies yet. The original ticket details are visible to the admin team in their inbox.
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-3xl border p-4 ${
                            message.author_type === 'admin'
                              ? 'border-brand-400/20 bg-brand-500/10'
                              : 'border-white/[0.08] bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">
                              {message.author_type === 'admin' ? 'Admin' : 'You'}
                            </p>
                            <p className="text-xs text-slate-400">{formatDate(message.created_at)}</p>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{message.body}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleReply} className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <label className="field-label">Reply</label>
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Add more detail or respond to the admin team."
                      className="field-input mt-2 min-h-28"
                    />
                    <div className="mt-4 flex justify-end">
                      <button type="submit" disabled={sendingReply} className="btn-primary">
                        {sendingReply ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm leading-6 text-slate-300/[0.72]">
            <p className="font-medium text-white">How the categories are used</p>
            <p className="mt-2 flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-amber-200" />
              Use feedback for ideas, concern for issues needing attention, and complaint when service quality needs escalation.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
