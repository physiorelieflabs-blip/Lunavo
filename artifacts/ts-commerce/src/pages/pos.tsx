import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clipboard, CreditCard, Printer, Search, ShoppingBag, Smartphone, Trash2, UsersRound, WifiOff } from 'lucide-react';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardOverviewQueryKey, getListCustomersQueryKey, getListDashboardActivityQueryKey, getListDropshipQueueQueryKey, getListOrdersQueryKey, useCreateOrder, useCreatePaymentIntent, useListCustomers, useListSupplierProducts, useVerifyPayment } from '@workspace/api-client-react';
import type { CreateOrderInput } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money } from '@/lib/format';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none placeholder:text-[#8994a2] focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';
const offlineQueueKey = 'ts-commerce-pos-queue';
type PosPaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'mobile_money';
type QueuedSale = { id: string; payload: CreateOrderInput; paymentMethod?: PosPaymentMethod; currency?: string; createdAt: string };

function readQueue(key: string): QueuedSale[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as QueuedSale[] : [];
  } catch {
    return [];
  }
}

function productPrice(product: { sellingPrice: number | null; salePrice: number | null; price: number | null }) {
  return product.sellingPrice ?? product.salePrice ?? product.price ?? 0;
}

export default function Pos() {
  const products = useListSupplierProducts();
  const customers = useListCustomers();
  const createOrder = useCreateOrder();
  const createPayment = useCreatePaymentIntent();
  const verifyPayment = useVerifyPayment();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const queueKey = `${offlineQueueKey}:${user?.id ?? 'anonymous'}`;
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('0');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; total: number; method: string; customerName: string; productTitle: string } | null>(null);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    setQueue(readQueue(queueKey));
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [queueKey]);

  const selectedProduct = products.data?.find((product) => String(product.id) === selectedProductId);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (products.data ?? []).filter((product) => product.visibility === 'active' && (!query || `${product.title} ${product.sku ?? ''}`.toLowerCase().includes(query))).slice(0, 12);
  }, [products.data, productSearch]);
  const selectedCustomer = customers.data?.find((customer) => String(customer.id) === customerId);
  const unitPrice = selectedProduct ? productPrice(selectedProduct) : 0;
  const lineSubtotal = unitPrice * Math.max(1, Number(quantity) || 1);
  const discountAmount = Math.min(lineSubtotal, Math.max(0, Number(discount) || 0));
  const total = Math.max(0, lineSubtotal - discountAmount);
  const inventoryWarning = selectedProduct?.inventoryStrategy === 'manual' && selectedProduct.availabilityQuantity !== null && selectedProduct.availabilityQuantity !== undefined && Number(quantity) > selectedProduct.availabilityQuantity;

  const persistQueue = (next: QueuedSale[]) => {
    setQueue(next);
    localStorage.setItem(queueKey, JSON.stringify(next));
  };

  const invalidateSales = () => void Promise.all([
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListDashboardActivityQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListDropshipQueueQueryKey() }),
  ]);

  const fillCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.data?.find((item) => String(item.id) === id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerEmail(customer.email);
      setCustomerPhone(customer.phone ?? '');
    }
  };

  const resetSale = () => {
    setSelectedProductId('');
    setProductSearch('');
    setQuantity('1');
    setDiscount('0');
    setCustomerId('');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setPaymentMethod('cash');
  };

  const paymentCode = (method: PosPaymentMethod): 'manual_cash' | 'manual_bank_transfer' | 'manual_other' => method === 'cash' ? 'manual_cash' : method === 'bank_transfer' ? 'manual_bank_transfer' : 'manual_other';
  const submitPayload = (payload: CreateOrderInput, receiptProductTitle: string, method: PosPaymentMethod, currency: string, fromQueue = false) => {
    createOrder.mutate({ data: payload }, {
      onSuccess: (order) => {
        const evidenceReference = `pos:${method}:${payload.idempotencyKey}`;
        createPayment.mutate({ data: {
          orderId: order.id,
          currency,
          method: paymentCode(method),
          evidenceReference,
          idempotencyKey: `${payload.idempotencyKey}:payment`,
        } }, {
          onSuccess: (payment) => {
            verifyPayment.mutate({ id: payment.id, data: { evidenceReference, note: `Verified at TS POS using ${method.replace('_', ' ')}.` } }, {
              onSuccess: (verified) => {
                if (verified.status !== 'verified') {
                  setMessage('The payment was not verified. The order remains pending.');
                  return;
                }
                if (fromQueue) {
                  const next = queue.filter((item) => item.payload.idempotencyKey !== payload.idempotencyKey);
                  persistQueue(next);
                } else {
                  setLastReceipt({ orderNumber: order.orderNumber, total: order.total, method, customerName: payload.customerName, productTitle: receiptProductTitle });
                  resetSale();
                }
                setMessage(fromQueue ? 'Offline sale synced and payment verified.' : 'Sale recorded, payment verified, and inventory/ledger views updated.');
                invalidateSales();
              },
              onError: () => setMessage(fromQueue ? 'The queued order synced, but payment verification is still pending.' : 'The order was created, but payment verification failed. Review it in Finance before treating it as paid.'),
            });
          },
          onError: () => setMessage(fromQueue ? 'The queued order synced, but its payment record could not be created.' : 'The order was created, but its payment record could not be created.'),
        });
      },
      onError: () => {
        setMessage(fromQueue ? 'A queued sale could not sync yet; it remains safely queued.' : 'The sale could not be recorded. Check the customer and product details.');
      },
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProduct || !customerName.trim() || !customerEmail.trim() || !total || inventoryWarning) return;
    const payload: CreateOrderInput = {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone.trim() || undefined,
      total: Number(total.toFixed(2)),
      quantity: Math.max(1, Number(quantity) || 1),
      status: 'pending',
      supplierProductId: selectedProduct.id,
      idempotencyKey: crypto.randomUUID(),
    };
    if (!online) {
      const next = [...queue, { id: payload.idempotencyKey!, payload, paymentMethod, currency: selectedProduct.currency, createdAt: new Date().toISOString() }];
      persistQueue(next);
      setMessage('You are offline. This sale is queued on this device and will sync when connection returns.');
      setLastReceipt({ orderNumber: 'OFFLINE QUEUED', total, method: paymentMethod, customerName: payload.customerName, productTitle: selectedProduct.title });
      resetSale();
      return;
    }
    submitPayload(payload, selectedProduct.title, paymentMethod, selectedProduct.currency);
  };

  const syncQueue = () => {
    if (!online || !queue.length || createOrder.isPending || createPayment.isPending || verifyPayment.isPending) return;
    const [item] = queue;
    if (item) submitPayload(item.payload, 'Queued sale', item.paymentMethod ?? 'cash', item.currency ?? 'USD', true);
  };

  if (products.isLoading || customers.isLoading) return <AppShell><LoadingState label="Loading point of sale" /></AppShell>;
  if (products.isError || customers.isError || !products.data || !customers.data) return <AppShell><ErrorState onRetry={() => { void Promise.all([products.refetch(), customers.refetch()]); }} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">TS POS</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Sell in person without losing the ledger.</h1><p className="mt-2 max-w-2xl text-sm text-[#697687]">Cashier checkout, customer lookup, inventory-aware quantities, printable receipts, and a safe offline queue.</p></div>
        <div className="flex items-center gap-2">{online ? <Badge tone="success">Online</Badge> : <Badge tone="warning"><WifiOff className="mr-1 inline h-3.5 w-3.5" />Offline</Badge>}{queue.length > 0 && <Badge tone="info">{queue.length} queued</Badge>}</div>
      </div>
      {message && <div className="mt-6"><Notice tone={message.includes('could not') ? 'danger' : message.includes('offline') ? 'warning' : 'success'} title={message.includes('offline') ? 'Sale queued locally' : 'POS update'}>{message}</Notice></div>}
      <div className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <form onSubmit={submit} className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-7">
          <SectionHeading eyebrow="Build a ticket" title="New in-person sale" description="Select one catalog product, then record the customer and payment method." />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2"><label className="text-sm font-bold">Find a product<div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#8994a2]" /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search active catalog products" data-testid="input-pos-product-search" /></div></label>{filteredProducts.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-2">{filteredProducts.map((product) => <button type="button" key={product.id} onClick={() => { setSelectedProductId(String(product.id)); setProductSearch(product.title); }} className={`rounded-xl border p-3 text-left ${selectedProductId === String(product.id) ? 'border-[#bba15e] bg-[#f5edda]' : 'border-[#d9d2c4] bg-[#f7f4ed] hover:border-[#bca26a]'}`} data-testid={`button-pos-product-${product.id}`}><p className="truncate text-sm font-extrabold">{product.title}</p><p className="mt-1 text-xs text-[#697687]">{money(productPrice(product), product.currency)} · {product.inventoryStatus}</p></button>)}</div>}{selectedProduct && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#182333] px-4 py-3 text-[#f8f3e8]"><span className="flex min-w-0 items-center gap-2 text-sm font-bold"><ShoppingBag className="h-4 w-4 shrink-0 text-[#d6aa46]" /><span className="truncate">{selectedProduct.title}</span></span><span className="font-mono">{money(unitPrice, selectedProduct.currency)}</span></div>}</div>
            <label className="text-sm font-bold">Quantity<input type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} data-testid="input-pos-quantity" />{inventoryWarning && <span className="mt-1 block text-xs font-bold text-[#943b35]">Only {selectedProduct?.availabilityQuantity} units are available.</span>}</label>
            <label className="text-sm font-bold">Discount amount<input type="number" min="0" step="0.01" max={lineSubtotal} value={discount} onChange={(event) => setDiscount(event.target.value)} className={inputClass} data-testid="input-pos-discount" /></label>
            <div className="md:col-span-2"><label className="text-sm font-bold">Returning customer<select value={customerId} onChange={(event) => fillCustomer(event.target.value)} className={inputClass} data-testid="select-pos-customer"><option value="">New customer / walk-in</option>{customers.data.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>)}</select></label></div>
            <label className="text-sm font-bold">Customer name<input required minLength={2} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClass} autoComplete="name" data-testid="input-pos-customer-name" /></label>
            <label className="text-sm font-bold">Customer email<input required type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className={inputClass} autoComplete="email" data-testid="input-pos-customer-email" /></label>
            <label className="text-sm font-bold">Phone <span className="font-normal text-[#8994a2]">(optional)</span><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={inputClass} autoComplete="tel" data-testid="input-pos-customer-phone" /></label>
            <fieldset><legend className="text-sm font-bold">Payment method</legend><div className="mt-2 grid grid-cols-2 gap-2">{([['cash', Banknote], ['bank_transfer', Smartphone], ['card', CreditCard], ['mobile_money', Smartphone]] as const).map(([method, Icon]) => <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${paymentMethod === method ? 'border-[#bba15e] bg-[#f5edda]' : 'border-[#d9d2c4] bg-[#f7f4ed]'}`}><Icon className="h-4 w-4 text-[#a2772e]" />{method.replace('_', ' ')}</button>)}</div></fieldset>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[#d9d2c4] pt-5"><div><p className="text-xs uppercase tracking-[.12em] text-[#697687]">Ticket total</p><p className="mt-1 font-mono text-3xl font-bold">{money(total, selectedProduct?.currency)}</p><p className="text-xs text-[#697687]">{money(lineSubtotal, selectedProduct?.currency)} subtotal · {money(discountAmount, selectedProduct?.currency)} discount</p></div><SubmitButton loading={createOrder.isPending || createPayment.isPending || verifyPayment.isPending || !selectedProduct || inventoryWarning}>{online ? 'Complete sale' : 'Queue sale offline'}</SubmitButton></div>
        </form>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#bba15e] bg-[#f5edda] p-5"><div className="flex items-center gap-2 text-[#85601b]"><Clipboard className="h-5 w-5" /><p className="font-mono text-[10px] uppercase tracking-[.16em]">Receipt desk</p></div>{lastReceipt ? <><p className="mt-5 text-xs uppercase tracking-[.12em] text-[#697687]">{lastReceipt.orderNumber}</p><h2 className="mt-2 text-xl font-extrabold">{lastReceipt.productTitle}</h2><div className="mt-5 space-y-2 border-y border-[#d8c68f] py-4 text-sm"><div className="flex justify-between"><span>Customer</span><strong>{lastReceipt.customerName}</strong></div><div className="flex justify-between"><span>Payment</span><strong className="capitalize">{lastReceipt.method.replace('_', ' ')}</strong></div><div className="flex justify-between"><span>Total</span><strong className="font-mono">{money(lastReceipt.total)}</strong></div></div><Button variant="secondary" className="mt-5 w-full" onClick={() => window.print()}><Printer className="h-4 w-4" />Print receipt</Button></> : <EmptyState title="No receipt yet" description="Complete a verified sale to create a print-ready receipt summary." />}</section>
          <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><SectionHeading eyebrow="Queue safety" title="Offline sync" description="Queued tickets are stored only on this device until they are accepted by the server." />{queue.length ? <><div className="space-y-2">{queue.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f7f4ed] p-3 text-xs"><span className="min-w-0 truncate font-bold">{item.payload.customerName} · {money(item.payload.total)}</span><button type="button" onClick={() => persistQueue(queue.filter((candidate) => candidate.id !== item.id))} className="ml-3 text-[#943b35]" aria-label={`Remove queued sale for ${item.payload.customerName}`}><Trash2 className="h-4 w-4" /></button></div>)}</div><Button className="mt-4 w-full" onClick={syncQueue} disabled={!online || createOrder.isPending}><CheckCircle2 className="h-4 w-4" />{online ? 'Sync queued sales' : 'Waiting for connection'}</Button></> : <p className="text-sm text-[#697687]">No tickets waiting to sync.</p>}</section>
          <div className="rounded-2xl border border-[#bfd6dc] bg-[#eef7f8] p-4 text-sm text-[#315e6c]"><UsersRound className="mb-2 h-5 w-5" /><strong>Customer lookup is live.</strong><p className="mt-1 text-xs leading-5">Returning customers keep their order history and spend totals in the same merchant-owned CRM record.</p></div>
        </aside>
      </div>
    </div>
  </AppShell>;
}