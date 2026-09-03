import { Bell, Check, RefreshCw, RotateCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getListDomainEventsQueryKey, getListNotificationsQueryKey,
  useListDomainEvents, useListNotifications, useMarkNotificationRead, useReplayDomainEvent,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, SectionHeading } from '@/components/primitives';
import { timeAgo } from '@/lib/format';

export default function Activity() {
  const notifications = useListNotifications(); const events = useListDomainEvents();
  const markRead = useMarkNotificationRead(); const replay = useReplayDomainEvent(); const client = useQueryClient();
  const refresh = () => void Promise.all([
    client.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    client.invalidateQueries({ queryKey: getListDomainEventsQueryKey() }),
  ]);
  if (notifications.isLoading || events.isLoading) return <AppShell><LoadingState label="Loading activity" /></AppShell>;
  if (notifications.isError || events.isError || !notifications.data || !events.data) return <AppShell><ErrorState onRetry={() => { void notifications.refetch(); void events.refetch(); }} /></AppShell>;
  return <AppShell><div className="mx-auto max-w-[1100px]"><SectionHeading eyebrow="Connected operations" title="Notifications & activity" description="Authoritative changes are recorded here and projected into merchant alerts. Financial balances remain in the ledger, not this activity stream." action={<Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4"/>Refresh</Button>}/>
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><section><h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold"><Bell className="h-5 w-5 text-[#a2772e]"/>Notifications</h2>{notifications.data.length ? <div className="space-y-3">{notifications.data.map((note) => <article key={note.id} className={`rounded-xl border p-4 ${note.readAt ? 'border-[#d9d2c4] bg-[#f7f4ed]' : 'border-[#b8d6ca] bg-[#eff8f3]'}`}><div className="flex gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{note.title}</h3><Badge tone={note.severity === 'warning' ? 'warning' : note.severity === 'success' ? 'success' : 'info'}>{note.severity}</Badge></div><p className="mt-1 text-sm text-[#536174]">{note.body}</p><p className="mt-2 text-xs text-[#697687]">{note.actorType ?? 'system'} via {note.source ?? 'projection'} · {note.entityType} #{note.entityId} · {timeAgo(note.createdAt)}</p></div>{!note.readAt && <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={markRead.isPending} onClick={() => markRead.mutate({ id: note.id }, { onSuccess: refresh })}><Check className="h-4 w-4"/>Read</Button>}</div>{note.deepLink && <Link href={note.deepLink} className="mt-3 inline-flex text-xs font-extrabold text-[#8a6826] underline">{note.actionLabel ?? 'Open record'}</Link>}</article>)}</div> : <EmptyState title="No notifications yet" description="Important merchant events will appear here when they occur."/>}</section>
      <section><h2 className="mb-3 text-lg font-extrabold">Event history</h2>{events.data.length ? <div className="space-y-3">{events.data.map((event) => <article key={event.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><h3 className="font-mono text-sm font-bold">{event.eventType}</h3><Badge tone={event.status === 'processed' ? 'success' : event.status === 'dead_letter' ? 'danger' : 'warning'}>{event.status}</Badge></div><p className="mt-2 text-xs text-[#697687]">{event.aggregateType} #{event.aggregateId} · {event.actorType} via {event.source} · v{event.payloadVersion} · {timeAgo(event.occurredAt)}</p>{event.lastError && <p className="mt-2 text-xs text-[#a33e38]">Projection retry: {event.lastError}</p>}</div>{['retry','dead_letter'].includes(event.status) && <Button variant="secondary" className="min-h-8 px-3 text-xs" disabled={replay.isPending} onClick={() => replay.mutate({ id: event.id }, { onSuccess: refresh })}><RotateCcw className="h-3.5 w-3.5"/>Replay projection</Button>}</div></article>)}</div> : <EmptyState title="No events yet" description="Event history is retained as commerce activity happens."/>}</section></div></div></AppShell>;
}