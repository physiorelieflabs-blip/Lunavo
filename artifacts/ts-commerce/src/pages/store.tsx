import { FormEvent, useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { ExternalLink, Eye, EyeOff, Palette, Plus, Store as StoreIcon, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getGetDashboardOverviewQueryKey,
  getGetCheckoutSettingsQueryKey,
  useCreateStore,
  useGetCheckoutSettings,
  useGetDashboardOverview,
  useUpdateCheckoutSettings,
  type StorefrontSection,
  type StorefrontTheme,
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
  const [theme, setTheme] = useState<StorefrontTheme>({
    accentColor: '#c85d3f',
    backgroundColor: '#f5f1e8',
    textColor: '#182333',
    layout: 'editorial',
    announcement: '',
    logoUrl: null,
    heroImageUrl: null,
  });
  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [published, setPublished] = useState(true);
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
    setTheme(overview.data.storefrontTheme);
    setSections(overview.data.storefrontSections);
    setPublished(overview.data.storefrontPublished);
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
       storefrontTheme: theme,
       storefrontSections: sections,
       storefrontPublished: published,
    } }, {
      onSuccess: (result) => {
        setStoreName(result.storeName);
        setStoreDescription(result.storeDescription ?? '');
        setStoreContactEmail(result.storeContactEmail ?? '');
        setStorePhone(result.storePhone ?? '');
        setStoreWebsite(result.storeWebsite ?? '');
        const address = result.storeAddress;
        setStoreAddress(address && typeof address === 'object' && 'formatted' in address ? String(address.formatted ?? '') : '');
         setTheme(result.storefrontTheme);
         setSections(result.storefrontSections);
         setPublished(result.storefrontPublished);
         setMessage(result.storefrontPublished ? 'Your storefront is published and ready for customers.' : 'Your storefront changes are saved as a draft.');
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

       <form onSubmit={save}>
       <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="Store identity" title="Make the storefront yours" description="You can change this later. Existing orders and historical money are not renamed or altered." />
         <div className="space-y-5">
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
             <Link href={`/store/${store.publicStoreKey}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9d2c4] px-4 text-sm font-extrabold text-[#536174] hover:bg-[#f7f4ed]" data-testid="link-preview-store">Open storefront <ExternalLink className="h-4 w-4" /></Link>
          </div>
         </div>
        </section>
      <section className="mt-6 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="Storefront system" title="Shape the customer experience" description="These settings control the published storefront, while products remain governed by catalog visibility and server-side checkout rules." />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ['accentColor', 'Accent'],
                ['backgroundColor', 'Canvas'],
                ['textColor', 'Text'],
              ] as const).map(([key, label]) => <label key={key} className="block text-sm font-bold">{label}<div className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-2"><input type="color" value={theme[key]} onChange={(event) => setTheme((current) => ({ ...current, [key]: event.target.value }))} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" /><span className="font-mono text-xs text-[#697687]">{theme[key]}</span></div></label>)}
            </div>
            <label className="block text-sm font-bold">Layout
              <select value={theme.layout} onChange={(event) => setTheme((current) => ({ ...current, layout: event.target.value as StorefrontTheme['layout'] }))} className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]">
                <option value="editorial">Editorial — large story-led hero</option>
                <option value="minimal">Minimal — quiet product grid</option>
                <option value="catalog">Catalog — dense discovery layout</option>
              </select>
            </label>
            <label className="block text-sm font-bold">Announcement bar <span className="font-normal text-[#697687]">(optional)</span>
              <input maxLength={160} value={theme.announcement} onChange={(event) => setTheme((current) => ({ ...current, announcement: event.target.value }))} placeholder="Free delivery this week" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]" />
            </label>
             <div className="grid gap-4 sm:grid-cols-2">
               <label className="block text-sm font-bold">Logo image URL <span className="font-normal text-[#697687]">(optional)</span>
                 <input type="url" value={theme.logoUrl ?? ''} onChange={(event) => setTheme((current) => ({ ...current, logoUrl: event.target.value.trim() || null }))} maxLength={2000} placeholder="https://cdn.example.com/logo.png" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-xs outline-none focus:border-[#bca26a]" />
               </label>
               <label className="block text-sm font-bold">Hero image URL <span className="font-normal text-[#697687]">(optional)</span>
                 <input type="url" value={theme.heroImageUrl ?? ''} onChange={(event) => setTheme((current) => ({ ...current, heroImageUrl: event.target.value.trim() || null }))} maxLength={2000} placeholder="https://cdn.example.com/hero.jpg" className="mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-xs outline-none focus:border-[#bca26a]" />
               </label>
             </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4">
              <div><p className="text-sm font-extrabold">Publication state</p><p className="mt-1 text-xs leading-5 text-[#697687]">{published ? 'Customers can browse this storefront.' : 'Only your workspace can see these changes.'}</p></div>
              <button type="button" onClick={() => setPublished((value) => !value)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold ${published ? 'bg-[#d8eee2] text-[#2f6958]' : 'bg-[#e7e2d8] text-[#536174]'}`}>{published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{published ? 'Published' : 'Draft'}</button>
            </div>
          </div>
          <div className="space-y-3">
             <div className="flex items-center justify-between"><p className="text-sm font-extrabold">Content sections</p><button type="button" onClick={() => setSections((current) => [...current, { id: `section-${Date.now()}`, type: 'story', enabled: true, heading: 'Tell your story', body: 'Share the point of view behind your collection.', imageUrl: null, imageAlt: '' }])} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-extrabold text-[#536174] hover:bg-[#f7f4ed]"><Plus className="h-3.5 w-3.5" />Add section</button></div>
             {sections.map((section, index) => <div key={section.id} className="rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] p-4">
              <div className="flex items-center gap-2"><select value={section.type} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, type: event.target.value as StorefrontSection['type'] } : item))} className="h-9 flex-1 rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-2 text-xs font-bold"><option value="hero">Hero</option><option value="products">Products</option><option value="story">Story</option><option value="announcement">Announcement</option></select><button type="button" onClick={() => setSections((current) => current.map((item) => item.id === section.id ? { ...item, enabled: !item.enabled } : item))} className={`rounded-lg p-2 ${section.enabled ? 'text-[#2f6958]' : 'text-[#9b9182]'}`} aria-label={section.enabled ? 'Disable section' : 'Enable section'}>{section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button type="button" disabled={index === 0} onClick={() => setSections((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })} className="rounded-lg px-2 text-xs font-bold text-[#697687] disabled:opacity-30" aria-label="Move section up">↑</button><button type="button" disabled={index === sections.length - 1} onClick={() => setSections((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next; })} className="rounded-lg px-2 text-xs font-bold text-[#697687] disabled:opacity-30" aria-label="Move section down">↓</button><button type="button" onClick={() => setSections((current) => current.filter((item) => item.id !== section.id))} className="rounded-lg p-2 text-[#a33e38]" aria-label="Remove section"><Trash2 className="h-4 w-4" /></button></div>
              <input value={section.heading} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, heading: event.target.value } : item))} maxLength={120} placeholder="Section heading" className="mt-3 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-3 text-sm font-bold outline-none focus:border-[#bca26a]" />
              <textarea value={section.body} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item))} maxLength={500} rows={2} placeholder="Optional supporting copy" className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-3 py-2 text-xs leading-5 outline-none focus:border-[#bca26a]" />
               <input type="url" value={section.imageUrl ?? ''} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, imageUrl: event.target.value.trim() || null } : item))} maxLength={2000} placeholder="Image URL (optional)" className="mt-2 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-3 text-xs outline-none focus:border-[#bca26a]" />
               <input value={section.imageAlt} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, imageAlt: event.target.value } : item))} maxLength={160} placeholder="Image alt text (recommended)" className="mt-2 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-3 text-xs outline-none focus:border-[#bca26a]" />
            </div>)}
            {!sections.length && <div className="rounded-xl border border-dashed border-[#cfc7b8] p-6 text-center text-sm text-[#697687]">Add a section to begin shaping your storefront.</div>}
            <div className="flex items-center justify-between gap-3 pt-2"><p className="text-xs leading-5 text-[#697687]"><Palette className="mr-1 inline h-3.5 w-3.5" />Save identity, theme, sections, and publication state together.</p><SubmitButton loading={createStore.isPending}>Save storefront</SubmitButton></div>
          </div>
        </div>
       </section>
       </form>
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