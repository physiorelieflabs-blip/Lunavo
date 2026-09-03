import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, Mail, Phone, RefreshCw, Save, Search, StickyNote, UsersRound, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListCustomersQueryKey, useListCustomers, useListOrders, useUpdateCustomer } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, SectionHeading } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';
import { downloadMerchantExport } from '@/lib/export';

const inputClass = 'h-11 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none placeholder:text-[#8994a2] focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

type Segment = 'all' | 'repeat' | 'vip' | 'new';

function segmentFor(customer: { orderCount: number; totalSpent: number; createdAt: string }) {
  if (customer.totalSpent >= 1000) return { label: 'VIP', tone: 'success' as const };
  if (customer.orderCount >= 2) return { label: 'Repeat', tone: 'info' as const };
  if (Date.now() - new Date(customer.createdAt).getTime() < 30 * 86400000) return { label: 'New', tone: 'warning' as const };
  return { label: 'Prospect', tone: 'neutral' as const };
}

function CustomerNotesPanel({ customer }: { customer: { id: number; name: string; notes: string | null; tags: string[]; marketingConsent: boolean } | null }) {
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setNotes(customer?.notes ?? '');
    setTags(customer?.tags.join(', ') ?? '');
    setMarketingConsent(customer?.marketingConsent ?? false);
    setMessage('');
  }, [customer?.id, customer?.notes, customer?.marketingConsent, customer?.tags]);

  if (!customer) return null;

  const save = () => {
    setMessage('');
    updateCustomer.mutate({ id: customer.id, data: { notes: notes.trim() || null, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), marketingConsent } }, {
      onSuccess: () => {
        setMessage('Saved');
        void queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
      onError: () => setMessage('Could not save'),
    });
  };

  return <section className="fixed bottom-5 left-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-2xl border border-[#d6aa46] bg-[#fffaf0] p-4 shadow-2xl" aria-label="Customer profile editor">
    <div className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-[#85601b]" /><p className="text-sm font-extrabold text-[#765817]">Customer profile for {customer.name}</p></div>
    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={4} placeholder="Add context for future conversations, preferences, or follow-up." className="mt-3 w-full rounded-lg border border-[#dfc27a] bg-white px-3 py-2 text-sm text-[#182333] outline-none focus:border-[#a2772e] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="textarea-customer-notes" />
    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[.1em] text-[#85601b]">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={800} placeholder="vip, wholesale, follow-up" className="mt-2 h-10 w-full rounded-lg border border-[#dfc27a] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#182333] outline-none focus:border-[#a2772e]" data-testid="input-customer-tags" /></label>
    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#765817]"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-1 accent-[#a2772e]" data-testid="input-customer-marketing-consent" />Marketing consent is active for this customer.</label>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-[#85601b]">{message || `${notes.length}/4000 characters`}</p><Button onClick={save} disabled={updateCustomer.isPending} className="min-h-9 px-3 text-xs"><Save className="h-3.5 w-3.5" />Save profile</Button></div>
  </section>;
}

function downloadCsv(customers: Array<{ name: string; email: string; phone: string | null; notes: string | null; tags: string[]; marketingConsent: boolean; orderCount: number; totalSpent: number }>) {
  const rows = [['Name', 'Email', 'Phone', 'Notes', 'Tags', 'Marketing consent', 'Orders', 'Total spent'], ...customers.map((customer) => [customer.name, customer.email, customer.phone ?? '', customer.notes ?? '', customer.tags.join('|'), customer.marketingConsent ? 'yes' : 'no', String(customer.orderCount), String(customer.totalSpent)])];
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `ts-commerce-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Customers() {
  const customers = useListCustomers();
  const orders = useListOrders();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (customers.data ?? []).filter((customer) => {
      const customerSegment = segmentFor(customer).label.toLowerCase();
      const matchesSegment = segment === 'all' || customerSegment === segment;
      const matchesSearch = !normalized || `${customer.name} ${customer.email} ${customer.phone ?? ''} ${customer.tags.join(' ')}`.toLowerCase().includes(normalized);
      return matchesSegment && matchesSearch;
    });
  }, [customers.data, query, segment]);
  const selectedCustomer = customers.data?.find((customer) => customer.id === selectedId) ?? null;
  const selectedOrders = useMemo(() => selectedCustomer ? (orders.data ?? []).filter((order) => order.customerEmail.toLowerCase() === selectedCustomer.email.toLowerCase()) : [], [orders.data, selectedCustomer]);
  const totalSpent = (customers.data ?? []).reduce((sum, customer) => sum + customer.totalSpent, 0);
  const repeatCount = (customers.data ?? []).filter((customer) => customer.orderCount >= 2).length;

  if (customers.isLoading || orders.isLoading) return <AppShell><LoadingState label="Loading customer workspace" /></AppShell>;
  if (customers.isError || orders.isError || !customers.data || !orders.data) return <AppShell><ErrorState onRetry={() => { void customers.refetch(); void orders.refetch(); }} /></AppShell>;

  return <AppShell><CustomerNotesPanel customer={selectedCustomer} />
     <div className="mx-auto max-w-[1240px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Customer relationship workspace</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Know who keeps coming back.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Search your audience, understand each buying relationship, and export the exact filtered view for a campaign or report.</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { void customers.refetch(); void orders.refetch(); }}><RefreshCw className="h-4 w-4" />Refresh</Button><Button variant="secondary" onClick={() => void downloadMerchantExport('customers')}><Download className="h-4 w-4" />Export all</Button><Button onClick={() => downloadCsv(filteredCustomers)} disabled={!filteredCustomers.length}><Download className="h-4 w-4" />Export filtered</Button></div></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#697687]">Unique buyers</p><p className="mt-3 font-mono text-3xl tracking-[-.08em]">{customers.data.length.toLocaleString()}</p><p className="mt-2 text-xs text-[#697687]">Across recorded orders</p></section><section className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-5"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#315e6c]">Repeat buyers</p><p className="mt-3 font-mono text-3xl tracking-[-.08em]">{repeatCount.toLocaleString()}</p><p className="mt-2 text-xs text-[#315e6c]">Two or more recorded orders</p></section><section className="rounded-xl border border-[#bba15e] bg-[#f5edda] p-5"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#697687]">Customer spend</p><p className="mt-3 font-mono text-3xl tracking-[-.08em]">{money(totalSpent)}</p><p className="mt-2 text-xs text-[#697687]">Paid and fulfilled orders</p></section></div>
       <section className="mt-9"><SectionHeading eyebrow="Audience intelligence" title="Customer directory" description="Segments are derived from recorded spend, order frequency, and recency. Tags and consent remain merchant-scoped CRM data." /><div className="mb-4 flex flex-wrap gap-3"><div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8994a2]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, or tag" className={`${inputClass} w-full pl-9`} data-testid="input-customer-search" /></div><select className={inputClass} value={segment} onChange={(event) => setSegment(event.target.value as Segment)} aria-label="Customer segment"><option value="all">All customers</option><option value="repeat">Repeat buyers</option><option value="vip">VIP customers</option><option value="new">New customers</option></select></div>{filteredCustomers.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="hidden grid-cols-[1.25fr_1.3fr_.9fr_.7fr_28px] gap-4 border-b border-[#d9d2c4] bg-[#f7f4ed] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#697687] md:grid"><span>Customer</span><span>Contact</span><span>Segment / tags</span><span className="text-right">Spent</span><span /></div><div className="divide-y divide-[#ded8cd]">{filteredCustomers.map((customer) => { const customerSegment = segmentFor(customer); return <button key={customer.id} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f7f4ed] md:grid-cols-[1.25fr_1.3fr_.9fr_.7fr_28px] md:items-center" onClick={() => setSelectedId(customer.id)} data-testid={`customer-${customer.id}`}><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e1ebee] text-[#316071]"><UsersRound className="h-4 w-4" /></div><div><p className="text-sm font-extrabold">{customer.name}</p><p className="text-xs text-[#697687]">Added {timeAgo(customer.createdAt)}</p></div></div><div className="text-sm text-[#536174]"><p>{customer.email}</p>{customer.phone && <p className="mt-1 text-xs">{customer.phone}</p>}</div><div><div className="flex flex-wrap gap-1"><Badge tone={customerSegment.tone}>{customerSegment.label}</Badge>{customer.tags.slice(0, 2).map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}</div><p className="mt-1 text-xs text-[#697687]">{customer.orderCount} order{customer.orderCount === 1 ? '' : 's'} · {customer.marketingConsent ? 'consented' : 'no consent'}</p></div><div className="text-left font-mono text-sm font-bold md:text-right">{money(customer.totalSpent)}</div><ArrowRight className="hidden h-4 w-4 text-[#8994a2] md:block" /></button>; })}</div></div> : <EmptyState title="No customers match this view" description="Try a different search or segment. Your filters only affect this local view." />}</section>
       {selectedCustomer && <div className="fixed inset-0 z-40 flex justify-end bg-[#182333]/40" role="dialog" aria-modal="true" aria-label="Customer profile" onClick={() => setSelectedId(null)}><aside className="h-full w-full max-w-[520px] overflow-y-auto bg-[#fbfaf6] p-6 shadow-2xl md:p-8" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#e1ebee] text-[#316071]"><UsersRound className="h-5 w-5" /></div><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a2772e]">Customer profile</p><h2 className="mt-1 text-2xl font-extrabold">{selectedCustomer.name}</h2></div></div><button className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9d2c4] hover:bg-[#f0ece4]" onClick={() => setSelectedId(null)} aria-label="Close customer profile"><X className="h-4 w-4" /></button></div><div className="mt-6 flex flex-wrap gap-2"><Badge tone={segmentFor(selectedCustomer).tone}>{segmentFor(selectedCustomer).label}</Badge><Badge tone="neutral">{selectedCustomer.orderCount} orders</Badge><Badge tone="neutral">{money(selectedCustomer.totalSpent)} spent</Badge></div><div className="mt-6 grid gap-3 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 text-sm"><a href={`mailto:${selectedCustomer.email}`} className="flex items-center gap-3 font-bold text-[#315e6c]"><Mail className="h-4 w-4" />{selectedCustomer.email}</a>{selectedCustomer.phone && <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-3 font-bold text-[#315e6c]"><Phone className="h-4 w-4" />{selectedCustomer.phone}</a>}</div><div className="mt-8"><SectionHeading eyebrow="Relationship timeline" title="Recorded orders" description="This timeline is read from your merchant-scoped order ledger." />{selectedOrders.length ? <div className="mt-4 space-y-3">{selectedOrders.map((order) => <div key={order.id} className="rounded-xl border border-[#d9d2c4] bg-white/60 p-4"><div className="flex items-center justify-between gap-4"><p className="font-mono text-xs font-bold">{order.orderNumber}</p><Badge tone={order.status === 'cancelled' ? 'danger' : order.status === 'paid' || order.status === 'fulfilled' ? 'success' : 'warning'}>{order.status}</Badge></div><p className="mt-2 text-sm font-extrabold">{order.productTitle ?? 'Commerce order'}</p><div className="mt-2 flex justify-between gap-4 text-xs text-[#697687]"><span>{timeAgo(order.createdAt)}</span><span className="font-mono font-bold text-[#182333]">{money(order.total, order.currency)}</span></div></div>)}</div> : <EmptyState title="No order timeline yet" description="Orders for this customer will appear here once recorded." />}</div></aside></div>}
    </div>
  </AppShell>;
}