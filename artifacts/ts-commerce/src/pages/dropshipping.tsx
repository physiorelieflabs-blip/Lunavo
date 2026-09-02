import { useState } from 'react';
import { ExternalLink, RefreshCw, Route } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListDropshipQueueQueryKey, getListOrdersQueryKey, useListDropshipQueue, useUpdateDropshipStatus } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

const nextStatus = {
  not_submitted: { value: 'submitted' as const, label: 'Mark submitted' },
  submitted: { value: 'accepted' as const, label: 'Mark accepted' },
  accepted: { value: 'processing' as const, label: 'Mark processing' },
  processing: { value: 'shipped' as const, label: 'Mark shipped' },
  shipped: { value: 'in_transit' as const, label: 'Mark in transit' },
  in_transit: { value: 'delivered' as const, label: 'Mark delivered' },
  delivered: null,
  canceled: null,
  failed: null,
};

export default function Dropshipping() {
  const queue = useListDropshipQueue();
  const updateStatus = useUpdateDropshipStatus();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  if (queue.isLoading) return <AppShell><LoadingState label="Loading fulfillment queue" /></AppShell>;
  if (queue.isError || !queue.data) return <AppShell><ErrorState onRetry={() => void queue.refetch()} /></AppShell>;

  const advance = (id: number, fulfillmentStatus: 'not_submitted' | 'submitted' | 'accepted' | 'processing' | 'shipped' | 'in_transit' | 'delivered' | 'canceled' | 'failed') => {
    setMessage('');
    updateStatus.mutate({ id, data: { fulfillmentStatus } }, {
      onSuccess: () => {
        setMessage(`Order marked ${fulfillmentStatus.replaceAll('_', ' ')}.`);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
        ]);
      },
      onError: () => setMessage('That fulfillment update could not be saved.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Internal auto DS</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Fulfillment without supplier API keys.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Product-linked paid orders arrive here automatically. TS Commerce prepares the supplier handoff and tracks every state; supplier checkout remains a deliberate manual step when the public link cannot support automation.</p></div><Badge tone="info">{queue.data.length} queued</Badge></div>
      {message && <div className="mt-7"><Notice tone={message.startsWith('That') ? 'danger' : 'success'} title={message.startsWith('That') ? 'Update not completed' : 'Queue updated'}>{message}</Notice></div>}
      <section className="mt-8"><SectionHeading eyebrow="Order routing" title="Supplier fulfillment queue" action={<Button variant="ghost" onClick={() => void queue.refetch()}><RefreshCw className="h-4 w-4" />Refresh</Button>} />
        {queue.data.length ? <div className="space-y-4">{queue.data.map((item) => { const action = nextStatus[item.fulfillmentStatus as keyof typeof nextStatus] ?? null; return <article key={item.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><Route className="h-4 w-4" /></div><div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">{item.orderNumber}</p><Badge tone={item.fulfillmentStatus === 'fulfilled' ? 'success' : 'warning'}>{item.fulfillmentStatus.replaceAll('_', ' ')}</Badge></div><h2 className="mt-2 font-extrabold">{item.productTitle}</h2><p className="mt-1 text-xs text-[#697687]">{item.customerName} · {item.customerEmail} · {timeAgo(item.createdAt)}</p></div></div><div className="text-right"><p className="font-mono text-lg font-bold">{money(item.total, item.currency)}</p><p className="text-xs text-[#697687]">{item.quantity} item{item.quantity === 1 ? '' : 's'}</p></div></div><div className="mt-5 grid gap-3 rounded-lg bg-[#f3efe5] p-4 text-xs sm:grid-cols-3"><div><p className="text-[#697687]">Supplier cost</p><p className="mt-1 font-mono font-bold">{item.supplierCost === null ? 'Unavailable' : money(item.supplierCost, item.currency)}</p></div><div><p className="text-[#697687]">Configured profit</p><p className="mt-1 font-mono font-bold text-[#2f6958]">{item.profit === null ? 'Unavailable' : money(item.profit, item.currency)}</p></div><div><p className="text-[#697687]">Ship to</p><p className="mt-1 font-bold text-[#182333]">{item.shippingAddress || 'Not provided'}</p></div></div><div className="mt-5 flex flex-wrap gap-3">{action && <Button onClick={() => advance(item.id, action.value)} disabled={updateStatus.isPending}>{action.label}</Button>}<a href={item.supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-4 text-sm font-bold text-[#182333] hover:border-[#bca26a]"><ExternalLink className="h-4 w-4" />Open supplier link</a></div></article>; })}</div> : <EmptyState title="Nothing needs fulfillment yet" description="Confirm payment on a product-linked checkout order and it will appear here automatically." />}
      </section>
    </div>
  </AppShell>;
}