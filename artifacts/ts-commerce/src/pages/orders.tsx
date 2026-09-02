import { FormEvent, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getListDropshipQueueQueryKey,
  getGetDashboardOverviewQueryKey,
  getListCustomersQueryKey,
  getListDashboardActivityQueryKey,
  getListOrdersQueryKey,
  useCreateOrder,
  useListSupplierProducts,
  useListOrders,
  useUpdateOrderStatus,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

export default function Orders() {
  const orders = useListOrders();
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();
  const products = useListSupplierProducts();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [total, setTotal] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierProductId, setSupplierProductId] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [message, setMessage] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    idempotencyKey.current ??= crypto.randomUUID();
    createOrder.mutate(
      {
        data: {
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          total: Number(total),
          orderNumber: orderNumber || undefined,
          supplierProductId: supplierProductId ? Number(supplierProductId) : undefined,
          shippingAddress: shippingAddress || undefined,
          status: 'paid',
          idempotencyKey: idempotencyKey.current,
        },
      },
      {
        onSuccess: () => {
          setMessage('Sale recorded. Your dashboard and customer ledger are up to date.');
          setCustomerName('');
          setCustomerEmail('');
          setCustomerPhone('');
          setTotal('');
          setOrderNumber('');
          setSupplierProductId('');
          setShippingAddress('');
          idempotencyKey.current = null;
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
          ]);
        },
        onError: () => setMessage('We could not record that sale. Check the customer details, total, and order number.'),
      },
    );
  };

  if (orders.isLoading) return <AppShell><LoadingState /></AppShell>;
  if (orders.isError || !orders.data || products.isError) return <AppShell><ErrorState onRetry={() => { void orders.refetch(); void products.refetch(); }} /></AppShell>;

  const changeOrderStatus = (id: number, status: 'paid' | 'cancelled') => {
    updateOrderStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        setMessage(status === 'paid' ? 'Payment confirmed. The sale is now in your ledger.' : 'Pending checkout cancelled.');
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
        ]);
      },
      onError: () => setMessage('That order could not be updated. Only pending checkout orders can be changed.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Commerce ledger</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Orders that belong to you.</h1><p className="mt-2 text-sm text-[#697687]">Record sales directly. Supplier connections can be added later without changing your ledger.</p></div>
        <Badge tone="info">{orders.data.length} recorded</Badge>
      </div>
      {message && <div className="mt-7"><Notice tone={message.startsWith('We') ? 'danger' : 'success'} title={message.startsWith('We') ? 'Action not completed' : 'Ledger updated'}>{message}</Notice></div>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7">
          <SectionHeading eyebrow="Record a sale" title="Add commerce activity" description="Paid sales immediately contribute to revenue. The platform fee reserve is held automatically." />
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required minLength={2} maxLength={160} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="Amina Okafor" /></label>
            <label className="block text-sm font-bold">Customer email<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="amina@example.com" /></label>
            <label className="block text-sm font-bold">Phone <span className="font-normal text-[#697687]">(optional)</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={40} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="+234 800 000 0000" /></label>
            <label className="block text-sm font-bold">Catalog product <span className="font-normal text-[#697687]">(optional)</span><select value={supplierProductId} onChange={(event) => { setSupplierProductId(event.target.value); const product = products.data?.find((item) => item.id === Number(event.target.value)); if (product?.sellingPrice !== null && product?.sellingPrice !== undefined) setTotal(String(product.sellingPrice)); }} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]"><option value="">No supplier product</option>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.title} — {product.sellingPrice === null ? 'needs price' : money(product.sellingPrice, product.currency)}</option>)}</select></label>
            {supplierProductId && <label className="block text-sm font-bold">Shipping address<input value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} required maxLength={500} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-sm outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="Address for supplier handoff" /></label>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">Sale total<input type="number" value={total} onChange={(event) => setTotal(event.target.value)} required min="0.01" step="0.01" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="125.00" /></label>
              <label className="block text-sm font-bold">Order number <span className="font-normal text-[#697687]">(optional)</span><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} maxLength={80} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 font-mono text-sm uppercase outline-none placeholder:text-[#8994a2] focus:border-[#bca26a]" placeholder="ORD-1042" /></label>
            </div>
            <SubmitButton loading={createOrder.isPending}><Plus className="h-4 w-4" />Record paid sale</SubmitButton>
          </form>
        </section>
        <section>
          <SectionHeading eyebrow="Recent orders" title="Your sales ledger" description="Only paid and fulfilled orders contribute to revenue; pending orders stay visible until they move." action={<Button variant="ghost" onClick={() => { void orders.refetch(); }} aria-label="Refresh orders"><RefreshCw className="h-4 w-4" />Refresh</Button>} />
          {orders.data.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{orders.data.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-4 px-5 py-4" data-testid={`order-${order.id}`}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]"><ClipboardList className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">{order.orderNumber}</p><Badge tone={order.status === 'paid' || order.status === 'fulfilled' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}>{order.status}</Badge>{order.productTitle && <Badge tone="info">{order.fulfillmentStatus.replaceAll('_', ' ')}</Badge>}</div><p className="mt-1 truncate text-xs text-[#697687]">{order.productTitle ? `${order.productTitle} · ` : ''}{order.customerName} · {order.customerEmail} · {timeAgo(order.createdAt)}</p>{order.status === 'pending' && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" className="min-h-8 px-3 text-xs" onClick={() => changeOrderStatus(order.id, 'paid')} disabled={updateOrderStatus.isPending}>Confirm payment</Button><Button type="button" variant="danger" className="min-h-8 px-3 text-xs" onClick={() => changeOrderStatus(order.id, 'cancelled')} disabled={updateOrderStatus.isPending}>Cancel checkout</Button></div>}</div><div className="text-right"><p className="font-mono text-sm font-bold">{money(order.total, order.currency)}</p><p className="text-[11px] text-[#697687]">{order.quantity} item{order.quantity === 1 ? '' : 's'}</p></div></div>)}</div></div> : <EmptyState title="No orders yet" description="Record your first sale or share your public checkout link to start building real order history." />}
          <Link href="/customers" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline">See customer ledger <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </div>
  </AppShell>;
}