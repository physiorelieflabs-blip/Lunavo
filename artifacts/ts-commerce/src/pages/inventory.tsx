import { type FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, History, Package, RefreshCw, Warehouse } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardOverviewQueryKey,
  getListInventoryMovementsQueryKey,
  getListInventoryReservationsQueryKey,
  getListSupplierProductsQueryKey,
  useCreateInventoryAdjustment,
  useListInventoryMovements,
  useListInventoryReservations,
  useListSupplierProducts,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function Inventory() {
  const products = useListSupplierProducts();
  const reservations = useListInventoryReservations();
  const movements = useListInventoryMovements();
  const adjustment = useCreateInventoryAdjustment();
  const client = useQueryClient();
  const [productId, setProductId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [referenceKey, setReferenceKey] = useState('');
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);

  const productMap = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const numericProducts = useMemo(() => (products.data ?? []).filter((product) => product.inventoryStrategy === 'manual' && typeof product.availabilityQuantity === 'number' && Number.isInteger(product.availabilityQuantity)), [products.data]);
  const invalidate = () => void Promise.all([
    client.invalidateQueries({ queryKey: getListSupplierProductsQueryKey() }),
    client.invalidateQueries({ queryKey: getListInventoryReservationsQueryKey() }),
    client.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() }),
    client.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
  ]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const quantityDelta = Number(delta);
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      setMessage({ text: 'Enter a non-zero whole-number adjustment.', success: false });
      return;
    }
    adjustment.mutate({ data: { supplierProductId: Number(productId), quantityDelta, reason: reason.trim(), referenceKey: referenceKey.trim() } }, {
      onSuccess: (movement) => {
        setMessage({ text: `Adjustment recorded: ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta} units.`, success: true });
        setDelta(''); setReason(''); setReferenceKey(''); setProductId('');
        invalidate();
      },
      onError: () => setMessage({ text: 'Adjustment could not be recorded. Confirm the product, whole-number delta, reason, and unique reference key.', success: false }),
    });
  };

  if (products.isLoading || reservations.isLoading || movements.isLoading) return <AppShell><LoadingState label="Loading inventory workspace" /></AppShell>;
  if (products.isError || reservations.isError || movements.isError || !products.data || !reservations.data || !movements.data) {
    return <AppShell><ErrorState onRetry={() => { void products.refetch(); void reservations.refetch(); void movements.refetch(); }} /></AppShell>;
  }
  const lowStock = numericProducts.filter((product) => (product.availabilityQuantity ?? 0) <= 5);
  return <AppShell><div className="mx-auto max-w-[1180px]">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Operations / Inventory</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Know what is available.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">A live view of your catalog stock, reservations, and immutable movement history. External supplier availability is never represented as a guessed quantity.</p></div>
      <Button variant="ghost" onClick={() => { void products.refetch(); void reservations.refetch(); void movements.refetch(); }} data-testid="button-refresh-inventory"><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {message && <div className="mt-7"><Notice tone={message.success ? 'success' : 'danger'} title={message.success ? 'Inventory updated' : 'Action not completed'}>{message.text}</Notice></div>}
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><Package className="h-5 w-5 text-[#a2772e]" /><p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#697687]">Catalog products</p><p className="mt-2 font-mono text-3xl font-bold" data-testid="text-inventory-product-count">{products.data.length}</p></section>
      <section className="rounded-2xl border border-[#dfc27a] bg-[#fff7df] p-5"><AlertTriangle className="h-5 w-5 text-[#85601b]" /><p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#765817]">Low or out of stock</p><p className="mt-2 font-mono text-3xl font-bold text-[#765817]" data-testid="text-low-stock-count">{lowStock.length}</p></section>
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><ClipboardList className="h-5 w-5 text-[#a2772e]" /><p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#697687]">Active reservations</p><p className="mt-2 font-mono text-3xl font-bold" data-testid="text-reservation-count">{reservations.data.filter((item) => item.status === 'reserved').length}</p></section>
    </div>
    <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Catalog stock" title="Inventory overview" description="Manual quantities are authoritative. Source-based and synchronized records remain externally sourced until a system reports a numeric quantity." />
      {products.data.length === 0 ? <EmptyState title="No catalog products" description="Import a supplier product before managing inventory." /> : <div className="divide-y divide-[#ded8cd] rounded-xl border border-[#d9d2c4]">{products.data.map((product) => {
        const numeric = product.inventoryStrategy === 'manual' && typeof product.availabilityQuantity === 'number' && Number.isInteger(product.availabilityQuantity);
        const quantity = product.availabilityQuantity ?? 0;
        return <div key={product.id} className="flex flex-wrap items-center gap-4 p-4" data-testid={`row-inventory-product-${product.id}`}><div className="min-w-0 flex-1"><p className="font-bold">{product.title}</p><p className="mt-1 text-xs text-[#697687]">{product.sku || product.sourceDomain}</p></div>{numeric ? <><span className={`font-mono text-xl font-bold ${quantity <= 0 ? 'text-[#a33e38]' : quantity <= 5 ? 'text-[#85601b]' : 'text-[#2f6958]'}`} data-testid={`text-stock-${product.id}`}>{quantity}</span><Badge tone={quantity <= 0 ? 'danger' : quantity <= 5 ? 'warning' : 'success'}>{quantity <= 0 ? 'Out of stock' : quantity <= 5 ? 'Low stock' : 'In stock'}</Badge></> : <Badge tone="info">Externally sourced · {product.inventoryStatus || 'unknown'}</Badge>}</div>;
      })}</div>}
    </section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Controlled write" title="Adjust manual stock" description="Every adjustment is recorded once against a reference key. Only manual numeric inventory can be adjusted." /><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-bold">Product<select required value={productId} onChange={(event) => setProductId(event.target.value)} className={inputClass} data-testid="select-adjustment-product"><option value="">Select a manual-inventory product</option>{numericProducts.map((product) => <option key={product.id} value={product.id}>{product.title} · {product.availabilityQuantity} available</option>)}</select></label><label className="block text-sm font-bold">Integer delta<input required type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} className={inputClass} data-testid="input-adjustment-delta" placeholder="e.g. 10 or -2" /></label><label className="block text-sm font-bold">Reason<textarea required minLength={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} h-20 py-2`} data-testid="input-adjustment-reason" placeholder="Why is stock changing?" /></label><label className="block text-sm font-bold">Idempotency / reference key<input required minLength={8} maxLength={160} value={referenceKey} onChange={(event) => setReferenceKey(event.target.value)} className={inputClass} data-testid="input-adjustment-reference" placeholder="e.g. count-2024-08-15-a" /></label><SubmitButton loading={adjustment.isPending}>Record adjustment</SubmitButton></form></section>
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Order holds" title="Reservation queue" description="Reservations are shown with their server-owned lifecycle and expiry time." />{reservations.data.length === 0 ? <EmptyState title="No reservations" description="Reserved stock will appear here when orders place a hold." /> : <div className="divide-y divide-[#ded8cd] rounded-xl border border-[#d9d2c4]">{reservations.data.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-reservation-${item.id}`}><div className="min-w-0 flex-1"><p className="font-bold">{productMap.get(item.supplierProductId)?.title || `Product #${item.supplierProductId}`}</p><p className="mt-1 text-xs text-[#697687]">Order #{item.orderId} · {item.quantity} unit{item.quantity === 1 ? '' : 's'} · expires {date(item.expiresAt)}</p></div><Badge tone={item.status === 'reserved' ? 'warning' : item.status === 'consumed' ? 'success' : 'neutral'}>{item.status}</Badge></div>)}</div>}</section>
    </div>
    <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Audit trail" title="Movement ledger" description="Immutable stock movements with signed deltas and their operational reason." />{movements.data.length === 0 ? <EmptyState title="No movements yet" description="Manual adjustments and order activity will appear in this ledger." /> : <div className="divide-y divide-[#ded8cd] rounded-xl border border-[#d9d2c4]">{movements.data.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-4 p-4" data-testid={`row-movement-${item.id}`}><History className="h-4 w-4 shrink-0 text-[#a2772e]" /><div className="min-w-0 flex-1"><p className="font-bold">{productMap.get(item.supplierProductId)?.title || `Product #${item.supplierProductId}`}</p><p className="mt-1 text-xs text-[#697687]">{item.reason} · {item.referenceKey} · {date(item.createdAt)}</p></div><span className={`font-mono font-bold ${item.quantityDelta > 0 ? 'text-[#2f6958]' : 'text-[#a33e38]'}`} data-testid={`text-movement-delta-${item.id}`}>{item.quantityDelta > 0 ? '+' : ''}{item.quantityDelta}</span></div>)}</div>}</section>
  </div></AppShell>;
}