import { useState } from 'react';
import { Clipboard, Copy, ExternalLink, PackageCheck, RefreshCw, Route, ShieldAlert, WalletCards } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardOverviewQueryKey, getGetMerchantBalancesQueryKey, getListDropshipQueueQueryKey, getListOrdersQueryKey, useCreateSupplierPayment, useListDropshipQueue, useUpdateDropshipStatus } from '@workspace/api-client-react';
import type { DropshipStatusInputFulfillmentStatus } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

const legalStatuses: DropshipStatusInputFulfillmentStatus[] = ['not_submitted', 'submitted', 'accepted', 'processing', 'shipped', 'in_transit', 'delivered', 'canceled', 'failed'];
const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none placeholder:text-[#8994a2] focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';
type FulfillmentDraft = { status: DropshipStatusInputFulfillmentStatus; reference: string; tracking: string; note: string };

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'delivered') return 'success';
  if (status === 'canceled' || status === 'failed') return 'danger';
  if (status === 'shipped' || status === 'in_transit') return 'info';
  if (status === 'not_submitted') return 'warning';
  return 'neutral';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export default function Dropshipping() {
  const queue = useListDropshipQueue();
  const updateStatus = useUpdateDropshipStatus();
  const createSupplierPayment = useCreateSupplierPayment();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Record<number, FulfillmentDraft>>({});
  const [copied, setCopied] = useState<number | null>(null);

  const draftFor = (item: NonNullable<typeof queue.data>[number]): FulfillmentDraft => drafts[item.id] ?? {
    status: legalStatuses.includes(item.fulfillmentStatus as DropshipStatusInputFulfillmentStatus) ? item.fulfillmentStatus as DropshipStatusInputFulfillmentStatus : 'not_submitted',
    reference: item.supplierOrderReference ?? '',
    tracking: item.trackingNumber ?? '',
    note: item.fulfillmentNote ?? '',
  };

  const setDraft = (id: number, updates: Partial<FulfillmentDraft>) => setDrafts((current) => ({ ...current, [id]: { ...draftFor(queue.data?.find((item) => item.id === id)!), ...updates } }));

  const saveFulfillment = (id: number) => {
    const draft = drafts[id] ?? draftFor(queue.data!.find((item) => item.id === id)!);
    setMessage('');
    updateStatus.mutate({ id, data: { fulfillmentStatus: draft.status, supplierOrderReference: draft.reference || null, trackingNumber: draft.tracking || null, fulfillmentNote: draft.note || null } }, {
      onSuccess: () => {
        setMessage(`Fulfillment marked ${statusLabel(draft.status)}. The order record now includes the supplier handoff details.`);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        ]);
      },
      onError: () => setMessage('That fulfillment update could not be saved. Check the status and supplier details, then try again.'),
    });
  };

  const copyText = (id: number, value: string, label: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      setMessage(`${label} copied. Paste it into the supplier checkout or your shipping workflow.`);
      window.setTimeout(() => setCopied(null), 1800);
    });
  };

  const allocateSupplierFunds = (item: NonNullable<typeof queue.data>[number]) => {
    setMessage('');
    createSupplierPayment.mutate({
      id: item.id,
      data: { supplierPaymentReference: drafts[item.id]?.reference?.trim() || `supplier:${item.orderNumber}` },
    }, {
      onSuccess: (payment) => {
        setMessage(`${money(payment.amountMinor / 100, payment.currency)} allocated to ${item.orderNumber}. Complete the supplier checkout using the supplier link; this internal ledger entry does not claim an external bank transfer.`);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetMerchantBalancesQueryKey() }),
        ]);
      },
      onError: (error) => setMessage(error instanceof Error ? error.message : 'Supplier funds could not be allocated.'),
    });
  };

  if (queue.isLoading) return <AppShell><LoadingState label="Loading fulfillment queue" /></AppShell>;
  if (queue.isError || !queue.data) return <AppShell><ErrorState onRetry={() => void queue.refetch()} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Manual fulfillment</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">A clear handoff, even without an API.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Paid product-linked orders arrive here. Open the supplier page, copy the customer details, place the order manually, then keep every legal fulfillment status and reference in one place.</p></div><Badge tone="info">{queue.data.length} in queue</Badge></div>
      {message && <div className="mt-7"><Notice tone={message.includes('could not') || message.includes('Insufficient') || message.includes('Confirm') ? 'danger' : 'success'} title={message.includes('could not') || message.includes('Insufficient') || message.includes('Confirm') ? 'Update not completed' : 'Queue updated'}>{message}</Notice></div>}
      {queue.data.some((item) => item.supplierPaymentStatus !== 'paid' && item.supplierCost !== null) && <section className="mt-8 rounded-xl border border-[#dfc27a] bg-[#fff7df] p-5"><div className="flex items-start gap-3"><WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-[#85601b]" /><div className="min-w-0 flex-1"><p className="font-extrabold text-[#765817]">Supplier funds ready for approval</p><p className="mt-1 text-sm leading-6 text-[#765817]">Approve the customer payment first, then allocate the recorded supplier cost from your internal TS Pay balance. Use the supplier checkout link to complete any external purchase.</p><div className="mt-4 space-y-2">{queue.data.filter((item) => item.supplierPaymentStatus !== 'paid' && item.supplierCost !== null).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e6cd89] bg-[#fffaf0] px-3 py-3"><div><p className="text-sm font-extrabold text-[#182333]">{item.orderNumber} · {item.productTitle}</p><p className="mt-1 text-xs text-[#765817]">Allocate {money((item.supplierCost ?? 0) * item.quantity, item.currency)} · {item.customerName}</p></div><Button className="min-h-9 px-3 text-xs" onClick={() => allocateSupplierFunds(item)} disabled={createSupplierPayment.isPending} data-testid={`button-approve-supplier-payment-${item.id}`}><WalletCards className="h-3.5 w-3.5" />Allocate funds</Button></div>)}</div></div></div></section>}
      <div className="mt-8 rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm text-[#315e6c]"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Manual mode is intentional.</strong> Supplier checkouts, delivery promises, and tracking remain external until you record them here. Never mark an order delivered until the supplier or carrier confirms it.</p></div></div>
      <section className="mt-8"><SectionHeading eyebrow="Order routing" title="Supplier fulfillment queue" description="Update status, supplier order reference, tracking number, and your internal note together." action={<Button variant="ghost" onClick={() => void queue.refetch()} data-testid="button-refresh-queue"><RefreshCw className="h-4 w-4" />Refresh</Button>} />
        {queue.data.length ? <div className="space-y-4">{queue.data.map((item) => { const draft = draftFor(item); return <article data-testid={`card-fulfillment-${item.id}`} key={item.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><Route className="h-4 w-4" /></div><div><div className="flex flex-wrap items-center gap-2"><p data-testid={`text-order-number-${item.id}`} className="font-mono text-sm font-bold">{item.orderNumber}</p><Badge tone={statusTone(item.fulfillmentStatus)}>{statusLabel(item.fulfillmentStatus)}</Badge><Badge tone={item.orderStatus === 'paid' ? 'success' : 'warning'}>{item.orderStatus}</Badge></div><h2 className="mt-2 font-extrabold">{item.productTitle}</h2><p className="mt-1 text-xs text-[#697687]">{item.customerName} · {item.customerEmail} · {timeAgo(item.createdAt)}</p></div></div><div className="text-right"><p data-testid={`text-fulfillment-total-${item.id}`} className="font-mono text-lg font-bold">{money(item.total, item.currency)}</p><p className="text-xs text-[#697687]">{item.quantity} item{item.quantity === 1 ? '' : 's'}</p></div></div><div className="mt-5 grid gap-3 rounded-lg bg-[#f3efe5] p-4 text-xs sm:grid-cols-3"><div><p className="text-[#697687]">Supplier cost</p><p className="mt-1 font-mono font-bold">{item.supplierCost === null ? 'Unavailable' : money(item.supplierCost, item.currency)}</p></div><div><p className="text-[#697687]">Your profit</p><p className="mt-1 font-mono font-bold text-[#2f6958]">{item.profit === null ? 'Unavailable' : money(item.profit, item.currency)}</p></div><div><p className="text-[#697687]">Ship to</p><p className="mt-1 whitespace-pre-line font-bold text-[#182333]">{item.shippingAddress || 'Not provided'}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><a data-testid={`link-supplier-${item.id}`} href={item.supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-3 text-xs font-bold text-[#182333] hover:border-[#bca26a]"><ExternalLink className="h-3.5 w-3.5" />Open supplier checkout</a><Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => copyText(item.id, item.shippingAddress || `${item.customerName}\n${item.customerEmail}`, 'Customer handoff details')} data-testid={`button-copy-customer-${item.id}`}><Copy className="h-3.5 w-3.5" />{copied === item.id ? 'Copied' : 'Copy customer details'}</Button><Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => copyText(item.id, item.shippingAddress || '', 'Shipping address')} disabled={!item.shippingAddress} data-testid={`button-copy-address-${item.id}`}><Clipboard className="h-3.5 w-3.5" />Copy address</Button></div><div className="mt-5 border-t border-[#ded8cd] pt-5"><p className="flex items-center gap-2 text-sm font-extrabold"><PackageCheck className="h-4 w-4 text-[#a2772e]" />Record supplier handoff</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Fulfillment status<select data-testid={`select-fulfillment-status-${item.id}`} value={draft.status} onChange={(event) => setDraft(item.id, { status: event.target.value as DropshipStatusInputFulfillmentStatus })} className={inputClass}>{legalStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-bold">Supplier order reference<input data-testid={`input-supplier-reference-${item.id}`} value={draft.reference} onChange={(event) => setDraft(item.id, { reference: event.target.value })} maxLength={240} placeholder="Order number from supplier checkout" className={inputClass} /></label><label className="text-sm font-bold">Tracking number<input data-testid={`input-tracking-number-${item.id}`} value={draft.tracking} onChange={(event) => setDraft(item.id, { tracking: event.target.value })} maxLength={240} placeholder="Carrier tracking reference" className={inputClass} /></label><label className="text-sm font-bold">Fulfillment note<textarea data-testid={`input-fulfillment-note-${item.id}`} value={draft.note} onChange={(event) => setDraft(item.id, { note: event.target.value })} maxLength={2000} rows={2} placeholder="What you confirmed, or what needs attention" className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm outline-none focus:border-[#bca26a]" /></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#697687]">Status history stays attached to this order. You can record canceled or failed handoffs without deleting the order.</p><SubmitButton loading={updateStatus.isPending}><PackageCheck className="h-4 w-4" />Save fulfillment update</SubmitButton></div></div></article>; })}</div> : <EmptyState title="Nothing needs fulfillment yet" description="Confirm payment on a product-linked checkout order and it will appear here automatically." />}
      </section>
    </div>
  </AppShell>;
}