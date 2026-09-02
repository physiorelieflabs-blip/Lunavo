import { type FormEvent, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, Filter, Plus, RefreshCw, Truck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetDashboardOverviewQueryKey,
  getListCustomersQueryKey,
  getListDashboardActivityQueryKey,
  getListDropshipQueueQueryKey,
  getListOrdersQueryKey,
  useCreateOrder,
  useListOrders,
  useListSupplierProducts,
  useUpdateOrderStatus,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none placeholder:text-[#8994a2] focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';

export default function Orders() {
  const orders = useListOrders();
  const products = useListSupplierProducts();
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [total, setTotal] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierProductId, setSupplierProductId] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [message, setMessage] = useState('');

  const visibleOrders = useMemo(() => {
    if (!orders.data) return [];
    return statusFilter === 'all' ? orders.data : orders.data.filter((order) => order.status === statusFilter);
  }, [orders.data, statusFilter]);

  const invalidateOrders = () => void Promise.all([
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    idempotencyKey.current ??= crypto.randomUUID();
    createOrder.mutate({ data: {
      customerName,
      customerEmail,
      customerPhone: customerPhone || undefined,
      total: Number(total),
      quantity: Number(quantity),
      orderNumber: orderNumber || undefined,
      supplierProductId: supplierProductId ? Number(supplierProductId) : undefined,
      shippingAddress: shippingAddress || undefined,
      status: 'paid',
      idempotencyKey: idempotencyKey.current,
    } }, {
      onSuccess: () => {
        setMessage('Sale recorded. Your ledger and supplier fulfillment queue are up to date.');
        setCustomerName('');
        setCustomerEmail('');
        setCustomerPhone('');
        setTotal('');
        setQuantity('1');
        setOrderNumber('');
        setSupplierProductId('');
        setShippingAddress('');
        idempotencyKey.current = null;
        invalidateOrders();
      },
      onError: () => setMessage('We could not record that sale. Check the customer details, total, and order number.'),
    });
  };

  const changeOrderStatus = (id: number, status: 'paid' | 'cancelled') => {
    updateOrderStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        setMessage(status === 'paid' ? 'Payment confirmed. The sale is now in your ledger.' : 'Pending checkout canceled.');
        invalidateOrders();
      },
      onError: () => setMessage('That order could not be updated. Only pending checkout orders can be changed.'),
    });
  };

  if (orders.isLoading || products.isLoading) return <AppShell><LoadingState label="Loading order ledger" /></AppShell>;
  if (orders.isError || products.isError || !orders.data || !products.data) return <AppShell><ErrorState onRetry={() => { void orders.refetch(); void products.refetch(); }} /></AppShell>;

  const productCount = orders.data.filter((order) => order.supplierProductId !== null).length;
  const paidCount = orders.data.filter((order) => order.status === 'paid' || order.status === 'fulfilled').length;
  const pendingCount = orders.data.filter((order) => order.status === 'pending').length;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Commerce ledger</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Orders that belong to you.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Record a sale, confirm a checkout payment, and keep supplier-linked fulfillment visible without hiding the customer record.</p></div><Badge tone="info">{orders.data.length} recorded</Badge></div>
      {message && <div className="mt-7"><Notice tone={message.startsWith('We') || message.startsWith('That') ? 'danger' : 'success'} title={message.startsWith('We') || message.startsWith('That') ? 'Action not completed' : 'Ledger updated'}>{message}</Notice></div>}
      <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Paid or fulfilled</p><p data-testid="metric-paid-orders" className="mt-2 font-mono text-2xl font-bold">{paidCount}</p></div><div className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#697687]">Pending confirmation</p><p data-testid="metric-pending-orders" className="mt-2 font-mono text-2xl font-bold text-[#85601b]">{pendingCount}</p></div><div className="rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-4"><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#2f6958]">Supplier-linked</p><p data-testid="metric-linked-orders" className="mt-2 font-mono text-2xl font-bold text-[#2f6958]">{productCount}</p></div></div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-7"><SectionHeading eyebrow="Record a sale" title="Add commerce activity" description="Paid sales contribute to revenue immediately. Product-linked sales also enter manual supplier fulfillment." /><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-bold">Customer name<input data-testid="input-customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required minLength={2} maxLength={160} className={inputClass} placeholder="Amina Okafor" /></label><label className="block text-sm font-bold">Customer email<input data-testid="input-customer-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} required className={inputClass} placeholder="amina@example.com" /></label><label className="block text-sm font-bold">Phone <span className="font-normal text-[#697687]">(optional)</span><input data-testid="input-customer-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={40} className={inputClass} placeholder="+234 800 000 0000" /></label><label className="block text-sm font-bold">Catalog product <span className="font-normal text-[#697687]">(optional)</span><select data-testid="select-order-product" value={supplierProductId} onChange={(event) => { setSupplierProductId(event.target.value); const product = products.data.find((item) => item.id === Number(event.target.value)); if (product?.sellingPrice !== null && product?.sellingPrice !== undefined) setTotal(String(product.sellingPrice * Number(quantity || 1))); }} className={inputClass}><option value="">No supplier product</option>{products.data.map((product) => <option key={product.id} value={product.id}>{product.title} — {product.sellingPrice === null ? 'needs price' : money(product.sellingPrice, product.currency)}</option>)}</select></label>{supplierProductId && <label className="block text-sm font-bold">Shipping address<input data-testid="input-shipping-address" value={shippingAddress} onChange={(event) => setShippingAddress(event.target.value)} required maxLength={500} className={inputClass} placeholder="Address for supplier handoff" /></label>}<div className="grid gap-4 sm:grid-cols-3"><label className="block text-sm font-bold">Quantity<input data-testid="input-order-quantity" type="number" value={quantity} onChange={(event) => { setQuantity(event.target.value); const product = products.data.find((item) => item.id === Number(supplierProductId)); if (product?.sellingPrice !== null && product?.sellingPrice !== undefined) setTotal(String(product.sellingPrice * Number(event.target.value || 1))); }} required min="1" max="100" step="1" className={inputClass} /></label><label className="block text-sm font-bold">Sale total<input data-testid="input-sale-total" type="number" value={total} onChange={(event) => setTotal(event.target.value)} required min="0.01" step="0.01" className={inputClass} placeholder="125.00" /></label><label className="block text-sm font-bold">Order number <span className="font-normal text-[#697687]">(optional)</span><input data-testid="input-order-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} maxLength={80} className={`${inputClass} uppercase`} placeholder="ORD-1042" /></label></div><SubmitButton loading={createOrder.isPending}><Plus className="h-4 w-4" />Record paid sale</SubmitButton></form></section>
        <section><SectionHeading eyebrow="Recent orders" title="Your sales ledger" description="Pending checkout orders stay visible until you confirm payment or cancel them." action={<Button variant="ghost" onClick={() => void orders.refetch()} data-testid="button-refresh-orders"><RefreshCw className="h-4 w-4" />Refresh</Button>} /><div className="mb-4 flex flex-wrap items-center gap-2"><Filter className="h-4 w-4 text-[#a2772e]" /><label className="sr-only" htmlFor="order-status-filter">Filter orders by status</label><select id="order-status-filter" data-testid="select-order-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-xs font-bold outline-none focus:border-[#bca26a]"><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Canceled</option></select><span className="text-xs text-[#697687]">{visibleOrders.length} shown</span></div>{visibleOrders.length ? <div className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="divide-y divide-[#ded8cd]">{visibleOrders.map((order) => <div data-testid={`row-order-${order.id}`} key={order.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cd] text-[#85601b]">{order.supplierProductId ? <Truck className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p data-testid={`text-order-id-${order.id}`} className="font-mono text-sm font-bold">{order.orderNumber}</p><Badge tone={order.status === 'paid' || order.status === 'fulfilled' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}>{order.status}</Badge>{order.productTitle && <Badge tone="info">{order.fulfillmentStatus.replaceAll('_', ' ')}</Badge>}</div><p className="mt-1 truncate text-xs text-[#697687]">{order.productTitle ? `${order.productTitle} · ` : ''}{order.customerName} · {order.customerEmail} · {timeAgo(order.createdAt)}</p>{order.shippingAddress && <p className="mt-1 truncate text-xs text-[#536174]">Ship to: {order.shippingAddress}</p>}{order.status === 'pending' && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" className="min-h-8 px-3 text-xs" onClick={() => changeOrderStatus(order.id, 'paid')} disabled={updateOrderStatus.isPending} data-testid={`button-confirm-order-${order.id}`}>Confirm payment</Button><Button type="button" variant="danger" className="min-h-8 px-3 text-xs" onClick={() => changeOrderStatus(order.id, 'cancelled')} disabled={updateOrderStatus.isPending} data-testid={`button-cancel-order-${order.id}`}>Cancel checkout</Button></div>}</div><div className="text-right"><p data-testid={`text-order-total-${order.id}`} className="font-mono text-sm font-bold">{money(order.total, order.currency)}</p><p className="text-[11px] text-[#697687]">{order.quantity} item{order.quantity === 1 ? '' : 's'}</p></div></div>)}</div></div> : <EmptyState title="No orders match this view" description={statusFilter === 'all' ? 'Record your first sale or share your public checkout link to start building real order history.' : 'Choose another status filter to see more of your ledger.'} />}<Link href="/dropshipping" data-testid="link-dropshipping" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#8a6826] underline">Open supplier fulfillment queue <ArrowRight className="h-4 w-4" /></Link></section>
      </div>
    </div>
  </AppShell>;
}