import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { ExternalLink, Store as StoreIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetDashboardOverviewQueryKey,
  getGetCheckoutSettingsQueryKey,
  useCreateStore,
  useGetCheckoutSettings,
  useGetDashboardOverview,
  useUpdateCheckoutSettings,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';

export default function StorePage() {
  const overview = useGetDashboardOverview();
  const { user } = useUser();
  const createStore = useCreateStore();
  const checkoutSettings = useGetCheckoutSettings();
  const updateCheckoutSettings = useUpdateCheckoutSettings();
  const queryClient = useQueryClient();
  const [storeName, setStoreName] = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [storeContactEmail, setStoreContactEmail] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeWebsite, setStoreWebsite] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [shippingFee, setShippingFee] = useState('0');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!overview.data) return;
    setStoreName(overview.data.storeName ?? '');
    setStoreDescription(overview.data.storeDescription ?? '');
    setStoreContactEmail(overview.data.storeContactEmail ?? '');
    setStorePhone(overview.data.storePhone ?? '');
    setStoreWebsite(overview.data.storeWebsite ?? '');
    const address = overview.data.storeAddress;
    setStoreAddress(address && typeof address === 'object' && 'formatted' in address ? String(address.formatted ?? '') : '');
  }, [overview.data]);

  useEffect(() => {
    if (!checkoutSettings.data) return;
    setTaxRate(String(checkoutSettings.data.taxRate));
    setShippingFee(String(checkoutSettings.data.shippingFee));
    setFreeShippingThreshold(checkoutSettings.data.freeShippingThreshold === null ? '' : String(checkoutSettings.data.freeShippingThreshold));
  }, [checkoutSettings.data]);

  if (overview.isLoading) return <AppShell><LoadingState label="Loading store workspace" /></AppShell>;
  if (overview.isError || !overview.data) return <AppShell><ErrorState onRetry={() => { void overview.refetch(); }} /></AppShell>;

  const store = overview.data;
  const value = storeName;
  const save = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    createStore.mutate({ data: {
      storeName: value,
      storeDescription: storeDescription.trim() || null,
      storeContactEmail: storeContactEmail.trim() || null,
      storePhone: storePhone.trim() || null,
      storeWebsite: storeWebsite.trim() || null,
      storeAddress: storeAddress.trim() ? { formatted: storeAddress.trim() } : null,
    } }, {
      onSuccess: (result) => {
        setStoreName(result.storeName);
        setStoreDescription(result.storeDescription ?? '');
        setStoreContactEmail(result.storeContactEmail ?? '');
        setStorePhone(result.storePhone ?? '');
        setStoreWebsite(result.storeWebsite ?? '');
        const address = result.storeAddress;
        setStoreAddress(address && typeof address === 'object' && 'formatted' in address ? String(address.formatted ?? '') : '');
        setMessage('Your store is live and the new name is saved to your merchant workspace.');
        void queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      },
      onError: () => setMessage('Store name could not be saved. Use 2 to 80 characters and try again.'),
    });
  };

  const saveCheckoutSettings = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const tax = Number(taxRate);
    const shipping = Number(shippingFee);
    const threshold = freeShippingThreshold.trim() === '' ? null : Number(freeShippingThreshold);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100 || !Number.isFinite(shipping) || shipping < 0 || (threshold !== null && (!Number.isFinite(threshold) || threshold < 0))) {
      setMessage('Checkout rules could not be saved. Use non-negative amounts and a tax rate from 0 to 100.');
      return;
    }
    updateCheckoutSettings.mutate({ data: { taxRate: tax, shippingFee: shipping, freeShippingThreshold: threshold } }, {
      onSuccess: () => {
        setMessage('Checkout pricing rules saved. New customer orders will receive a server-calculated tax and shipping snapshot.');
        void queryClient.invalidateQueries({ queryKey: getGetCheckoutSettingsQueryKey() });
      },
      onError: () => setMessage('Checkout rules could not be saved. Check the values and try again.'),
    });
  };

  return <AppShell>
    <div className="mx-auto max-w-[900px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Merchant storefront</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Create your store.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Edit the identity and public contact information customers see. Changes are saved to your tenant and appear across your dashboard and public storefront.</p>
        </div>
        <Badge tone="success"><StoreIcon className="mr-1 h-3.5 w-3.5" /> Live</Badge>
      </div>

      {message && <div className="mt-7"><Notice tone={message.includes('could not') ? 'danger' : 'success'} title={message.includes('could not') ? 'Store not saved' : 'Store saved'}>{message}</Notice></div>}

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="Store identity" title="Make the storefront yours" description="You can change this later. Existing orders and historical money are not renamed or altered." />
        <form onSubmit={save} className="space-y-5">
          <label className="block text-sm font-bold">Store name
            <input value={value} onChange={(event) => setStoreName(event.target.value)} minLength={2} maxLength={80} required className="mt-2 h-12 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-base font-bold outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-store-name" />
          </label>
          <label className="block text-sm font-bold">Store description <span className="font-normal text-[#697687]">(optional)</span>
            <textarea value={storeDescription} onChange={(event) => setStoreDescription(event.target.value)} maxLength={500} rows={4} placeholder="What should customers know about your store?" className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-store-description" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold">Public contact email <span className="font-normal text-[#697687]">(optional)</span>
              <input type="email" value={storeContactEmail} onChange={(event) => setStoreContactEmail(event.target.value)} maxLength={240} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="hello@yourstore.com" data-testid="input-store-contact-email" />
            </label>
            <label className="block text-sm font-bold">Public phone <span className="font-normal text-[#697687]">(optional)</span>
              <input value={storePhone} onChange={(event) => setStorePhone(event.target.value)} maxLength={40} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="+234 800 000 0000" data-testid="input-store-phone" />
            </label>
          </div>
          <label className="block text-sm font-bold">Store website <span className="font-normal text-[#697687]">(optional)</span>
            <input type="url" value={storeWebsite} onChange={(event) => setStoreWebsite(event.target.value)} maxLength={500} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" placeholder="https://yourstore.com" data-testid="input-store-website" />
          </label>
          <label className="block text-sm font-bold">Public store address <span className="font-normal text-[#697687]">(optional)</span>
            <textarea value={storeAddress} onChange={(event) => setStoreAddress(event.target.value)} maxLength={500} rows={3} placeholder="Address customers can use to contact or visit you" className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 py-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-store-address" />
          </label>
          <div className="grid gap-4 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4 text-sm sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-[.12em] text-[#697687]">Store slug</p><p className="mt-2 font-mono font-bold">/{store.storeSlug}</p></div>
            <div><p className="text-xs uppercase tracking-[.12em] text-[#697687]">Workspace status</p><p className="mt-2 font-bold text-[#2f6958]">Authenticated and tenant-owned</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton loading={createStore.isPending}>Save store</SubmitButton>
            {user?.id && <Link href={`/checkout/${user.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9d2c4] px-4 text-sm font-extrabold text-[#536174] hover:bg-[#f7f4ed]" data-testid="link-preview-store">Preview checkout <ExternalLink className="h-4 w-4" /></Link>}
          </div>
        </form>
      </section>
      <section className="mt-6 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="Checkout rules" title="Set tax and shipping" description="These rules are calculated on the server and snapshotted on each order. Customers provide their shipping address at checkout; no merchant address is required." />
        <form onSubmit={saveCheckoutSettings} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-bold">Tax rate (%)
              <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} type="number" min="0" max="100" step="0.01" required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-tax-rate" />
            </label>
            <label className="block text-sm font-bold">Shipping fee ({checkoutSettings.data?.currency ?? store.currency})
              <input value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} type="number" min="0" step="0.01" required className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-shipping-fee" />
            </label>
            <label className="block text-sm font-bold">Free shipping over ({checkoutSettings.data?.currency ?? store.currency})
              <input value={freeShippingThreshold} onChange={(event) => setFreeShippingThreshold(event.target.value)} type="number" min="0" step="0.01" placeholder="No threshold" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20" data-testid="input-free-shipping-threshold" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[#697687]">Historical orders keep their original subtotal, tax, shipping, and total values when you change these settings.</p>
            <SubmitButton loading={updateCheckoutSettings.isPending}>Save checkout rules</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  </AppShell>;
}