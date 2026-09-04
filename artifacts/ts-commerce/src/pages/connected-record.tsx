import { ArrowLeft, ArrowUpRight, Boxes, CheckCircle2, CircleDollarSign, Clock3, FileText, Link2, PackageCheck, Receipt, RotateCcw, UserRound } from 'lucide-react';
import { Link, useLocation, useRoute } from 'wouter';
import { getGetCustomerContextQueryKey, getGetInvoiceContextQueryKey, getGetOrderContextQueryKey, useGetCustomerContext, useGetInvoiceContext, useGetOrderContext } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

type RecordValue = { id: string; target: string; snapshot: Record<string, unknown> };
type Impact = { currency: string | null; orderTotalMinor: number; verifiedPaidMinor: number; refundedMinor: number; netRevenueMinor: number; ledgerEffectMinor: number; reservedUnits: number; committedUnits: number; releasedUnits: number };
type EventValue = { id: number; eventType: string; aggregateType: string; aggregateId: string; actorType: string; source: string; status: string; attempts: number; occurredAt: string; processedAt: string | null; lastError: string | null };

const snapshotText = (record: RecordValue | null | undefined, keys: string[]) => {
  if (!record) return 'Not linked';
  for (const key of keys) {
    const value = record.snapshot[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return `Record ${record.id}`;
};

function ImpactCards({ impact }: { impact: Impact }) {
  const currency = impact.currency ?? undefined;
  const card = (label: string, value: string, tone = '') => <div className={`rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4 ${tone}`}><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#697687]">{label}</p><p className="mt-2 font-mono text-xl font-bold">{value}</p></div>;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {card('Verified paid', money(impact.verifiedPaidMinor / 100, currency))}
    {card('Refunded', money(impact.refundedMinor / 100, currency), 'bg-[#fff5f1]')}
    {card('Net revenue', money(impact.netRevenueMinor / 100, currency), 'bg-[#eff8f3]')}
    {card('Inventory movement', `${impact.committedUnits} committed · ${impact.reservedUnits} reserved`, 'bg-[#eef7f8]')}
  </div>;
}

function EventTimeline({ events }: { events: EventValue[] }) {
  return <section className="mt-8"><SectionHeading eyebrow="Traceability" title="What happened" description="Every state change is linked to its actor, source, processing status, and timestamp." />{events.length ? <div className="mt-4 space-y-3">{events.map((event) => <div key={event.id} className="flex gap-3 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><Clock3 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold">{event.eventType.replaceAll('.', ' · ')}</p><Badge tone={event.status === 'processed' ? 'success' : event.status === 'failed' ? 'danger' : 'warning'}>{event.status}</Badge></div><p className="mt-1 text-xs text-[#697687]">{event.actorType} via {event.source} · {timeAgo(event.occurredAt)} · attempt {event.attempts}</p>{event.lastError && <p className="mt-2 text-xs text-[#a33e38]">{event.lastError}</p>}</div></div>)}</div> : <EmptyState title="No events recorded yet" description="Connected events will appear here as the record moves through checkout, payment, fulfillment, and support." />}</section>;
}

function RelationshipList({ title, eyebrow, icon: Icon, records, empty, onLink }: { title: string; eyebrow: string; icon: typeof Link2; records: RecordValue[]; empty: string; onLink?: (record: RecordValue) => string | null }) {
  return <section className="mt-8"><SectionHeading eyebrow={eyebrow} title={title} />{records.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{records.map((record) => {
    const target = onLink ? onLink(record) : record.target;
    const content = <div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{snapshotText(record, ['orderNumber', 'invoiceNumber', 'title', 'name', 'email', 'referenceKey', 'entryType', 'reason'])}</p><p className="mt-1 text-xs text-[#697687]">#{record.id} · {target ? 'Open connected record' : 'Snapshot available here'}</p></div>{target && <ArrowUpRight className="h-4 w-4 shrink-0 text-[#8994a2] transition group-hover:text-[#a2772e]" />}</div>;
    return target ? <Link key={record.id} href={target} className="group rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4 transition hover:border-[#bca26a] hover:bg-[#f7f4ed]">{content}</Link> : <div key={record.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4">{content}</div>;
  })}</div> : <EmptyState title={empty} description="Nothing has been recorded in this relationship yet." />}</section>;
}

function RecordHeader({ eyebrow, title, back = '/orders' }: { eyebrow: string; title: string; back?: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={back} className="inline-flex items-center gap-2 text-xs font-extrabold text-[#8a6826]"><ArrowLeft className="h-3.5 w-3.5" />Back to workspace</Link><p className="mt-5 font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">{eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">One connected record: what happened, what it affected, and what needs attention next.</p></div></div>;
}

export function OrderContextPage() {
  const [, params] = useRoute('/orders/:id');
  const id = Number(params?.id);
  const query = useGetOrderContext(id, { query: { queryKey: getGetOrderContextQueryKey(id), enabled: Number.isFinite(id) && id > 0, retry: false } });
  if (query.isLoading) return <AppShell><LoadingState label="Loading connected order record" /></AppShell>;
  if (query.isError || !query.data) return <AppShell><ErrorState onRetry={() => void query.refetch()} /></AppShell>;
  const data = query.data as any;
  const order = data.order as RecordValue;
  const status = String(order.snapshot.status ?? 'pending');
  return <AppShell><div className="mx-auto max-w-[1180px]"><RecordHeader eyebrow="Connected order record" title={snapshotText(order, ['orderNumber', 'id'])} /><div className="mt-7 flex flex-wrap items-center gap-2"><Badge tone={status === 'paid' || status === 'fulfilled' ? 'success' : status === 'cancelled' ? 'danger' : 'warning'}>{status}</Badge><Badge tone="info">{String(order.snapshot.currency ?? data.impact.currency ?? '')}</Badge><span className="text-xs text-[#697687]">Created {timeAgo(String(order.snapshot.createdAt ?? ''))}</span></div><div className="mt-7"><ImpactCards impact={data.impact} /></div><div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div><RelationshipList title="People & commerce" eyebrow="Connected entities" icon={UserRound} records={[data.customer, data.product].filter(Boolean)} empty="No customer or product linked" onLink={(record) => record.target.startsWith('/customers/') ? record.target : null} /> <RelationshipList title="Money trail" eyebrow="Payments & accounting" icon={CircleDollarSign} records={[...data.paymentRecords, ...data.ledgerEntries, ...data.refunds]} empty="No payment or ledger records yet" onLink={() => null} /><RelationshipList title="Stock & fulfillment" eyebrow="Operations" icon={Boxes} records={[...data.inventoryReservations, ...data.inventoryMovements]} empty="No inventory movement yet" onLink={() => null} /><RelationshipList title="Invoices" eyebrow="Documents" icon={FileText} records={data.invoices} empty="No invoice linked" /></div><aside className="space-y-4"><section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><SectionHeading eyebrow="Fulfillment" title="Next operational view" /><div className="mt-4 rounded-lg bg-[#f7f4ed] p-3 text-sm"><p className="font-extrabold">{String(data.fulfillment.status ?? 'unassigned').replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-[#697687]">{String(data.fulfillment.trackingNumber ?? data.fulfillment.supplierOrderReference ?? 'No tracking or supplier reference yet')}</p></div>{data.nextActions.length ? <div className="mt-4 space-y-2">{data.nextActions.map((action: any) => <Link key={`${action.action}-${action.target}`} href={action.target}><Button variant="secondary" className="w-full justify-between">{String(action.action).replaceAll('_', ' ')}<ArrowUpRight className="h-4 w-4" /></Button></Link>)}</div> : <Notice tone="info" title="No action required">The record is waiting for its next authoritative state transition.</Notice>}</section><section className="rounded-xl border border-[#d9d2c4] bg-[#eef7f8] p-5"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#315e6c]">Ledger effect</p><p className="mt-2 font-mono text-2xl font-bold text-[#234c58]">{money(data.impact.ledgerEffectMinor / 100, data.impact.currency ?? undefined)}</p><p className="mt-2 text-xs leading-5 text-[#315e6c]">Calculated from verified payment and refund ledger entries. This page does not recompute or mutate financial truth.</p></section></aside></div><EventTimeline events={data.events} /></div></AppShell>;
}

export function CustomerContextPage() {
  const [, params] = useRoute('/customers/:id');
  const id = Number(params?.id);
  const query = useGetCustomerContext(id, { query: { queryKey: getGetCustomerContextQueryKey(id), enabled: Number.isFinite(id) && id > 0, retry: false } });
  if (query.isLoading) return <AppShell><LoadingState label="Loading customer relationship" /></AppShell>;
  if (query.isError || !query.data) return <AppShell><ErrorState onRetry={() => void query.refetch()} /></AppShell>;
  const data = query.data as any;
  const customer = data.customer as RecordValue;
  return <AppShell><div className="mx-auto max-w-[1180px]"><RecordHeader eyebrow="Customer relationship record" title={snapshotText(customer, ['name', 'email'])} back="/customers" /><div className="mt-7"><ImpactCards impact={data.lifetime} /></div><div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div><RelationshipList title="Orders" eyebrow="Purchase history" icon={PackageCheck} records={data.orders} empty="No orders yet" /><RelationshipList title="Invoices" eyebrow="Commercial documents" icon={FileText} records={data.invoices} empty="No invoices yet" /><RelationshipList title="Payments & refunds" eyebrow="Financial history" icon={CircleDollarSign} records={[...data.paymentRecords, ...data.refunds]} empty="No payment history yet" onLink={() => null} /></div><aside className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><SectionHeading eyebrow="CRM" title="Relationship health" /><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-[#697687]">Orders</span><strong>{data.orders.length}</strong></div><div className="flex justify-between gap-4"><span className="text-[#697687]">Invoices</span><strong>{data.invoices.length}</strong></div><div className="flex justify-between gap-4"><span className="text-[#697687]">Refunds</span><strong>{data.refunds.length}</strong></div><div className="flex justify-between gap-4"><span className="text-[#697687]">Net revenue</span><strong className="font-mono">{money(data.lifetime.netRevenueMinor / 100, data.lifetime.currency ?? undefined)}</strong></div></div><div className="mt-5 rounded-lg bg-[#f7f4ed] p-3 text-xs leading-5 text-[#536174]">Customer identity, consent, tags, and notes remain merchant-scoped authoritative CRM data.</div></aside></div><EventTimeline events={data.events} /></div></AppShell>;
}

export function InvoiceContextPage() {
  const [, params] = useRoute('/invoices/:id');
  const id = Number(params?.id);
  const query = useGetInvoiceContext(id, { query: { queryKey: getGetInvoiceContextQueryKey(id), enabled: Number.isFinite(id) && id > 0, retry: false } });
  if (query.isLoading) return <AppShell><LoadingState label="Loading connected invoice" /></AppShell>;
  if (query.isError || !query.data) return <AppShell><ErrorState onRetry={() => void query.refetch()} /></AppShell>;
  const data = query.data as any;
  const invoice = data.invoice as RecordValue;
  return <AppShell><div className="mx-auto max-w-[1180px]"><RecordHeader eyebrow="Connected invoice record" title={snapshotText(invoice, ['invoiceNumber', 'id'])} back="/invoices" /><div className="mt-7"><ImpactCards impact={data.impact} /></div><div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div><RelationshipList title="Invoice lines" eyebrow="Immutable pricing snapshot" icon={Receipt} records={data.lines} empty="No invoice lines" onLink={() => null} /><RelationshipList title="Customer & order" eyebrow="Connected records" icon={UserRound} records={[data.customer, data.order].filter(Boolean)} empty="No linked records" /><RelationshipList title="Payment evidence & ledger" eyebrow="Review trail" icon={CircleDollarSign} records={[...data.submissions, ...data.paymentRecords, ...data.ledgerEntries]} empty="No payment evidence yet" onLink={() => null} /></div><aside className="rounded-xl border border-[#d9d2c4] bg-[#fff7df] p-5"><SectionHeading eyebrow="Review state" title="Next action" /><div className="mt-4 space-y-2">{data.nextActions.length ? data.nextActions.map((action: any) => <Link key={`${action.action}-${action.target}`} href={action.target}><Button className="w-full justify-between">{String(action.action).replaceAll('_', ' ')}<ArrowUpRight className="h-4 w-4" /></Button></Link>) : <Notice tone="info" title="No pending action">This invoice is waiting for a new payment or state transition.</Notice>}</div><p className="mt-5 text-xs leading-5 text-[#765817]">Subtotal, tax, shipping, discount, total, currency, and customer details are immutable snapshots from invoice creation.</p></aside></div><EventTimeline events={data.events} /></div></AppShell>;
}