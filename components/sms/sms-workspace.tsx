'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { AlertCircle, ArrowLeft, Check, CheckCheck, MessageSquare, MessageSquarePlus, Phone, Search, Send, UserRound } from 'lucide-react'
import { markConversationRead, sendSms } from '@/lib/actions/sms'
import { formatDate, formatRelative, formatTime } from '@/lib/format'
import { formatPhone, toE164 } from '@/lib/phone'
import { SMS_MAX_LENGTH, type SmsLeadRef, type SmsMessageWithLead } from '@/lib/sms/shape'
import { createClient } from '@/lib/supabase/client'
import type { SmsMessage } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/progress'
import { toast } from '@/components/ui/toaster'

export type SmsNumberOption = {
  id: string
  phoneNumber: string
  name: string
  assignedTo: string | null
  assignedName: string | null
}

type ConversationKey = { numberId: string; contact: string }

type Conversation = ConversationKey & {
  key: string
  lead: SmsLeadRef
  messages: SmsMessageWithLead[]
  last: SmsMessageWithLead
  unread: number
}

function keyOf(numberId: string, contact: string) {
  return `${numberId}|${contact}`
}

function contactLabel(lead: SmsLeadRef, contact: string) {
  return lead ? lead.full_name : formatPhone(contact)
}

/**
 * Texts on the workspace's numbers: one conversation per number + contact,
 * live over Realtime. Teammates with their own number text from it; shared
 * numbers are open to everyone who can write.
 */
export function SmsWorkspace({
  orgId,
  numbers,
  defaultNumberId,
  messages: initialMessages,
  canWrite,
  isAdmin,
  ready,
  initial,
}: {
  orgId: string
  numbers: SmsNumberOption[]
  defaultNumberId: string | null
  messages: SmsMessageWithLead[]
  canWrite: boolean
  isAdmin: boolean
  /** Twilio keys are on the server, so texts can actually be sent. */
  ready: boolean
  initial: { numberId: string | null; contact: string | null; lead: SmsLeadRef } | null
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [numberFilter, setNumberFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<(ConversationKey & { lead: SmsLeadRef }) | null>(() =>
    initial?.numberId && initial.contact ? { numberId: initial.numberId, contact: initial.contact, lead: initial.lead } : null,
  )
  const [draft, setDraft] = useState('')
  const [sending, startSend] = useTransition()
  const [composing, setComposing] = useState(false)
  const [newTo, setNewTo] = useState('')
  const [newFrom, setNewFrom] = useState(defaultNumberId ?? '')
  const threadEnd = useRef<HTMLDivElement | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const numberById = useMemo(() => new Map(numbers.map((number) => [number.id, number])), [numbers])

  // New and updated texts arrive live; the lead link is carried over from the conversation.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`sms-${orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `org_id=eq.${orgId}` }, (payload) => {
        const row = payload.new as SmsMessage
        setMessages((current) => {
          if (current.some((item) => item.id === row.id)) return current
          const sibling = current.find((item) => item.phone_number_id === row.phone_number_id && item.contact_number === row.contact_number)
          return [...current, { ...row, lead: sibling?.lead ?? null }]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sms_messages', filter: `org_id=eq.${orgId}` }, (payload) => {
        const row = payload.new as SmsMessage
        setMessages((current) => current.map((item) => (item.id === row.id ? { ...item, ...row } : item)))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      channel.unsubscribe()
    }
  }, [orgId])

  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>()
    for (const message of messages) {
      const key = keyOf(message.phone_number_id, message.contact_number)
      const existing = map.get(key)
      if (existing) {
        existing.messages.push(message)
        existing.last = message
        if (message.lead) existing.lead = message.lead
        if (message.direction === 'inbound' && !message.read_at) existing.unread += 1
      } else {
        map.set(key, {
          key,
          numberId: message.phone_number_id,
          contact: message.contact_number,
          lead: message.lead,
          messages: [message],
          last: message,
          unread: message.direction === 'inbound' && !message.read_at ? 1 : 0,
        })
      }
    }
    return [...map.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
  }, [messages])

  const visible = conversations.filter((conversation) => {
    if (numberFilter !== 'all' && conversation.numberId !== numberFilter) return false
    if (!search.trim()) return true
    const term = search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return (
      (digits.length > 0 && conversation.contact.includes(digits)) ||
      contactLabel(conversation.lead, conversation.contact).toLowerCase().includes(term) ||
      (conversation.lead?.company ?? '').toLowerCase().includes(term)
    )
  })

  const current = selected ? conversations.find((conversation) => conversation.key === keyOf(selected.numberId, selected.contact)) : null
  const thread = current?.messages ?? []
  const currentLead = current?.lead ?? selected?.lead ?? null
  const currentNumber = selected ? numberById.get(selected.numberId) : null
  const unreadTotal = conversations.reduce((sum, conversation) => sum + conversation.unread, 0)

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end' })
  }, [thread.length, selected?.contact])

  // Opening a conversation clears its unread count for everyone.
  useEffect(() => {
    if (!selected || !current || current.unread === 0) return
    const { numberId, contact } = selected
    const now = new Date().toISOString()
    setMessages((items) =>
      items.map((item) =>
        item.phone_number_id === numberId && item.contact_number === contact && item.direction === 'inbound' && !item.read_at
          ? { ...item, read_at: now }
          : item,
      ),
    )
    void markConversationRead(numberId, contact)
  }, [selected, current])

  // The URL follows the open conversation (so it can be shared or reloaded)
  // without re-fetching the page: Next keeps its router in step with
  // history.replaceState.
  const open = useCallback((conversation: ConversationKey & { lead: SmsLeadRef }) => {
    setSelected(conversation)
    setDraft('')
    window.history.replaceState(null, '', `/sms?number=${conversation.numberId}&with=${encodeURIComponent(conversation.contact)}`)
  }, [])

  const send = () => {
    if (!selected || !draft.trim()) return
    const body = draft.trim()
    startSend(async () => {
      const result = await sendSms({ numberId: selected.numberId, to: selected.contact, body, leadId: currentLead?.id ?? null })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDraft('')
      setMessages((items) => (items.some((item) => item.id === result.message.id) ? items : [...items, { ...result.message, lead: currentLead }]))
    })
  }

  const startNew = () => {
    const to = toE164(newTo)
    if (!to) {
      toast.error('Enter the full number with area code, e.g. +1 305 555 0100.')
      return
    }
    if (!newFrom) {
      toast.error('Pick the number to text from.')
      return
    }
    setComposing(false)
    setNewTo('')
    const existing = conversations.find((conversation) => conversation.numberId === newFrom && conversation.contact === to)
    open({ numberId: newFrom, contact: to, lead: existing?.lead ?? null })
  }

  const fromLabel = (number: SmsNumberOption) =>
    `${number.name || 'Number'} · ${formatPhone(number.phoneNumber)}${number.assignedName ? ` (${number.assignedName})` : ''}`

  if (numbers.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-5">
        <SectionHeading eyebrow="Messaging" title="SMS" description="Texts sent and received on your workspace numbers." />
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No phone number yet"
            description={
              isAdmin
                ? 'Texting uses the numbers on your Team page. Add one there and every text to it shows up here.'
                : 'Ask an admin to add a phone number on the Team page. Every text to it will show up here.'
            }
            action={
              isAdmin ? (
                <Link href="/team" className={buttonVariants({ variant: 'brand' })}>
                  <Phone className="size-4" />
                  Add a number
                </Link>
              ) : null
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <SectionHeading
        eyebrow="Messaging"
        title="SMS"
        description={
          unreadTotal > 0
            ? `${unreadTotal} unread text${unreadTotal === 1 ? '' : 's'} across your numbers.`
            : 'Texts sent and received on your workspace numbers, live.'
        }
        action={
          canWrite ? (
            <Button variant="brand" onClick={() => setComposing(true)} disabled={!ready}>
              <MessageSquarePlus className="size-4" />
              New text
            </Button>
          ) : null
        }
      />

      {!ready ? (
        <div className="rounded-xl border border-warning/30 bg-warning/[0.06] p-4 text-sm">
          Texting isn’t set up on the server yet (Twilio keys missing). Texts that arrive are still kept here.
        </div>
      ) : null}

      <Card className="grid min-h-[calc(100vh-14rem)] overflow-hidden lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <div className={cn('flex min-h-0 flex-col border-border lg:border-r', selected ? 'hidden lg:flex' : 'flex')}>
          <div className="space-y-2 border-b border-border p-3">
            {numbers.length > 1 ? (
              <Select value={numberFilter} onChange={(event) => setNumberFilter(event.target.value)} aria-label="Filter by number" className="h-9 text-xs">
                <option value="all">All numbers</option>
                {numbers.map((number) => (
                  <option key={number.id} value={number.id}>
                    {fromLabel(number)}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="px-1 text-xs text-muted-foreground">{fromLabel(numbers[0])}</p>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or number" className="h-9 pl-8 text-xs" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={conversations.length === 0 ? 'No texts yet' : 'Nothing matches'}
                description={
                  conversations.length === 0
                    ? 'Texts to your numbers appear here the moment they arrive. Start one with "New text".'
                    : 'Try another name or number.'
                }
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((conversation) => {
                  const active = current?.key === conversation.key
                  const number = numberById.get(conversation.numberId)
                  return (
                    <li key={conversation.key}>
                      <button
                        type="button"
                        onClick={() => open(conversation)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40',
                          active && 'bg-secondary/60',
                        )}
                      >
                        <Avatar name={contactLabel(conversation.lead, conversation.contact)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={cn('truncate text-sm', conversation.unread > 0 ? 'font-semibold' : 'font-medium')}>
                              {contactLabel(conversation.lead, conversation.contact)}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(conversation.last.created_at)}</span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {conversation.last.direction === 'outbound' ? 'You: ' : ''}
                            {conversation.last.body}
                          </p>
                          {numbers.length > 1 && number ? (
                            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground/80">
                              via {number.name || formatPhone(number.phoneNumber)}
                            </p>
                          ) : null}
                        </div>
                        {conversation.unread > 0 ? (
                          <span className="mt-1 flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">
                            {conversation.unread}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={cn('flex min-h-0 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
          {!selected ? (
            <EmptyState
              icon={MessageSquare}
              title="Pick a conversation"
              description="Or start a new text to any number."
              className="my-auto"
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setComposing(true)} disabled={!ready}>
                    <MessageSquarePlus className="size-4" />
                    New text
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null)
                    window.history.replaceState(null, '', '/sms')
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <Avatar name={contactLabel(currentLead, selected.contact)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{contactLabel(currentLead, selected.contact)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {currentLead ? `${formatPhone(selected.contact)}${currentLead.company ? ` · ${currentLead.company}` : ''}` : 'Not in your CRM'}
                    {currentNumber ? ` · from ${currentNumber.name || formatPhone(currentNumber.phoneNumber)}` : ''}
                  </p>
                </div>
                {currentLead ? (
                  <>
                    <Link href={`/targeting/${currentLead.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <UserRound className="size-3.5" />
                      Lead
                    </Link>
                    <Link href={`/dialer/${currentLead.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <Phone className="size-3.5" />
                      Call
                    </Link>
                  </>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-secondary/10 px-4 py-4">
                {thread.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    No texts with {contactLabel(currentLead, selected.contact)} yet. Say hello below.
                  </p>
                ) : null}
                {thread.map((message, index) => {
                  const mine = message.direction === 'outbound'
                  const previous = thread[index - 1]
                  const newDay = !previous || previous.created_at.slice(0, 10) !== message.created_at.slice(0, 10)
                  return (
                    <div key={message.id}>
                      {newDay ? (
                        <p className="my-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                          {formatDate(message.created_at)}
                        </p>
                      ) : null}
                      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap',
                            mine ? 'rounded-br-md bg-gradient-brand text-white' : 'rounded-bl-md border border-border bg-card',
                          )}
                        >
                          {message.body}
                          <p className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-muted-foreground')}>
                            {formatTime(message.created_at)}
                            {mine ? (
                              message.status === 'failed' ? (
                                <AlertCircle className="size-3" aria-label="Failed" />
                              ) : message.status === 'delivered' ? (
                                <CheckCheck className="size-3" aria-label="Delivered" />
                              ) : (
                                <Check className="size-3" aria-label="Sent" />
                              )
                            ) : null}
                          </p>
                          {message.status === 'failed' && message.error ? (
                            <p className="mt-1 text-[11px] text-white/85">Not delivered: {message.error}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEnd} />
              </div>

              {canWrite ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    send()
                  }}
                  className="flex items-end gap-2 border-t border-border p-3"
                >
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, SMS_MAX_LENGTH))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        send()
                      }
                    }}
                    placeholder={ready ? 'Type a text… (Enter to send, Shift+Enter for a new line)' : 'Texting is not set up on the server yet.'}
                    disabled={!ready || sending}
                    rows={2}
                    className="min-h-11 max-h-40"
                  />
                  <Button type="submit" variant="brand" disabled={!ready || sending || !draft.trim()} aria-label="Send text">
                    {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </div>
      </Card>

      <Modal open={composing} onClose={() => setComposing(false)} title="New text" description="Texts go out from one of your workspace numbers.">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            startNew()
          }}
          className="space-y-4"
        >
          <Field label="To" htmlFor="sms-to" hint="Full number with area code.">
            <Input id="sms-to" value={newTo} onChange={(event) => setNewTo(event.target.value)} placeholder="+1 305 555 0100" autoFocus />
          </Field>
          <Field label="From" htmlFor="sms-from">
            <Select id="sms-from" value={newFrom} onChange={(event) => setNewFrom(event.target.value)}>
              {numbers.map((number) => (
                <option key={number.id} value={number.id}>
                  {fromLabel(number)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand">
              Open conversation
            </Button>
          </div>
        </form>
      </Modal>

      {numbers.length > 1 && selected && currentNumber?.assignedName ? (
        <p className="text-xs text-muted-foreground">
          <Badge tone="outline">{currentNumber.assignedName}’s number</Badge>
        </p>
      ) : null}
    </div>
  )
}
