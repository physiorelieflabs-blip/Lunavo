import { type FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  ListChecks,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Store,
  Upload,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListSupplierProductsQueryKey,
  getListSupplierImportHistoryQueryKey,
  getListSuppliersQueryKey,
  useAcceptSupplierRefresh,
  useAnalyzeSupplierProduct,
  useCreateManualSupplierProduct,
  useImportSupplierProduct,
  useImportSupplierProductBatch,
  useUpdateSupplierProduct,
  useListSupplierProducts,
  useListSupplierImportHistory,
  useListSuppliers,
  useRefreshSupplierProduct,
  useUpdateSupplier,
} from '@workspace/api-client-react';
import type { DuplicateCandidate, SupplierProductInput, SupplierProductPreview, SupplierRefreshAcceptInputFieldsItem, SupplierRefreshResponse } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, SectionHeading, SubmitButton } from '@/components/primitives';
import { money, timeAgo } from '@/lib/format';

type PricingMode = 'same_price' | 'fixed_markup' | 'percentage_markup' | 'fixed_margin' | 'custom';
type Visibility = 'draft' | 'active' | 'hidden';
type InventoryStrategy = 'manual' | 'source_based' | 'synchronized';
type DuplicateAction = 'create_new' | 'update_existing' | 'skip' | 'review';

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none placeholder:text-[#8994a2] focus:border-[#bca26a] focus:ring-2 focus:ring-[#bca26a]/20';
const darkInputClass = 'mt-2 h-11 w-full rounded-lg border border-[#46566a] bg-[#26364a] px-3 text-sm text-[#f8f3e8] outline-none placeholder:text-[#aab6c2] focus:border-[#d6aa46]';
const refreshFields = ['title', 'description', 'imageUrl', 'imageUrls', 'price', 'salePrice', 'currency', 'sku', 'sourceProductId', 'variants', 'attributes', 'availability', 'availabilityQuantity', 'category', 'specifications', 'brand', 'shippingInformation'];

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return 'supplier source';
  }
}

function numberOrNull(value: string) {
  return value.trim() === '' ? null : Number(value);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function previewDraft(preview: SupplierProductPreview) {
  const defaultCost = preview.salePrice ?? preview.price;
  return {
    sourceUrl: preview.sourceUrl,
    supplierUrl: `https://${preview.sourceDomain}`,
    title: preview.title,
    description: preview.description ?? '',
    imageUrl: preview.imageUrl ?? '',
    salePrice: preview.salePrice ?? preview.price,
    currency: preview.currency,
    sku: preview.sku ?? '',
    category: preview.category ?? '',
    brand: preview.brand ?? '',
    costPrice: defaultCost === null ? '' : String(defaultCost),
    pricingMode: 'fixed_markup' as PricingMode,
    profitValue: '0',
    sellingPrice: '',
    visibility: 'draft' as Visibility,
    marketplaceVisibility: false,
    inventoryStrategy: 'source_based' as InventoryStrategy,
    inventoryStatus: preview.availability ?? 'unknown',
    inventoryQuantity: preview.availabilityQuantity === null ? '' : String(preview.availabilityQuantity),
    duplicateAction: 'review' as DuplicateAction,
    tags: '',
    preview,
  };
}

function calculatedPrice(draft: ReturnType<typeof previewDraft>) {
  const cost = Number(draft.costPrice);
  const value = Number(draft.profitValue);
  if (!Number.isFinite(cost)) return null;
  if (draft.pricingMode === 'same_price') return cost;
  if (draft.pricingMode === 'fixed_markup') return cost + value;
  if (draft.pricingMode === 'percentage_markup') return cost * (1 + value / 100);
  if (draft.pricingMode === 'fixed_margin') return value >= 100 ? null : cost / (1 - value / 100);
  return numberOrNull(draft.sellingPrice);
}

function refreshField(change: Record<string, unknown>) {
  const field = typeof change.field === 'string' ? change.field : typeof change.name === 'string' ? change.name : '';
  return refreshFields.includes(field) ? field : refreshFields.find((candidate) => candidate in change) ?? '';
}

function rightsNotice() {
  return (
    <Notice tone="warning" title="Confirm source rights before publishing">
      A public page is not automatically a resale permission. Confirm that you have the supplier&apos;s permission to use its images, descriptions, and trademarks. TS Commerce stores the source link for your review; it does not verify commercial rights.
    </Notice>
  );
}

export default function Suppliers() {
  const products = useListSupplierProducts();
  const suppliers = useListSuppliers();
  const analyze = useAnalyzeSupplierProduct();
  const importProduct = useImportSupplierProduct();
  const batchImport = useImportSupplierProductBatch();
  const manualImport = useCreateManualSupplierProduct();
  const refresh = useRefreshSupplierProduct();
  const acceptRefresh = useAcceptSupplierRefresh();
  const updateSupplier = useUpdateSupplier();
  const queryClient = useQueryClient();
  const [sourceUrl, setSourceUrl] = useState('');
  const [analysis, setAnalysis] = useState<{ preview: SupplierProductPreview; duplicates: DuplicateCandidate[] } | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof previewDraft> | null>(null);
  const [batchUrls, setBatchUrls] = useState('');
  const [batchProfitType, setBatchProfitType] = useState<'fixed' | 'percentage'>('fixed');
  const [batchProfitValue, setBatchProfitValue] = useState('0');
  const [batchInventory, setBatchInventory] = useState<InventoryStrategy>('source_based');
  const [batchDuplicateAction, setBatchDuplicateAction] = useState<DuplicateAction>('review');
  const [batchResults, setBatchResults] = useState<Record<string, unknown>[]>([]);
  const [manual, setManual] = useState({ title: '', supplierName: '', supplierUrl: '', description: '', imageUrl: '', price: '', sellingPrice: '', salePrice: '', currency: 'USD', sku: '', category: '', inventoryStrategy: 'manual' as InventoryStrategy, inventoryStatus: 'available', inventoryQuantity: '' });
  const [message, setMessage] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [supplierEditId, setSupplierEditId] = useState<number | null>(null);
  const [supplierDraft, setSupplierDraft] = useState({ name: '', contactEmail: '', contactPhone: '', category: '', notes: '' });
  const [refreshResult, setRefreshResult] = useState<SupplierRefreshResponse | null>(null);
  const [acceptedFields, setAcceptedFields] = useState<string[]>([]);
  const [productEditId, setProductEditId] = useState<number | null>(null);
  const [productEdit, setProductEdit] = useState({ title: '', description: '', imageUrl: '', sellingPrice: '', visibility: 'draft' as Visibility, inventoryStrategy: 'source_based' as InventoryStrategy, inventoryStatus: '', inventoryQuantity: '' });
  const history = useListSupplierImportHistory();
  const updateProduct = useUpdateSupplierProduct();

  const priced = useMemo(() => (draft ? calculatedPrice(draft) : null), [draft]);
  const setDraftValue = <K extends keyof ReturnType<typeof previewDraft>>(key: K, value: ReturnType<typeof previewDraft>[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);

  const invalidateProducts = () => void Promise.all([
    queryClient.invalidateQueries({ queryKey: getListSupplierProductsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListSupplierImportHistoryQueryKey() }),
  ]);
  const invalidateSuppliers = () => void queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });

  const runAnalyze = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    analyze.mutate({ data: { sourceUrl } }, {
      onSuccess: (result) => {
        setAnalysis({ preview: result.preview, duplicates: result.duplicates });
        setDraft(previewDraft(result.preview));
        setMessage(result.message || 'Source analyzed. Review every field before saving.');
      },
      onError: () => setMessage('The source could not be analyzed. It may require login, block automated access, or not expose public product metadata. You can use manual entry below.'),
    });
  };

  const saveAnalyzed = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const profitType = draft.pricingMode === 'percentage_markup' || draft.pricingMode === 'fixed_margin' ? 'percentage' : 'fixed';
    const payload: SupplierProductInput = {
      sourceUrl: draft.sourceUrl,
      supplierUrl: draft.supplierUrl || null,
      title: draft.title,
      description: draft.description || null,
      imageUrl: draft.imageUrl || null,
      salePrice: draft.salePrice,
      currency: draft.currency,
      sku: draft.sku || null,
      category: draft.category || null,
      brand: draft.brand || null,
      tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      availability: draft.inventoryStatus || null,
      availabilityQuantity: numberOrNull(draft.inventoryQuantity),
      variants: draft.preview.variants,
      attributes: draft.preview.attributes,
      specifications: draft.preview.specifications,
      shippingInformation: draft.preview.shippingInformation,
      profitType,
      profitValue: Number(draft.profitValue) || 0,
      costPrice: numberOrNull(draft.costPrice) ?? undefined,
      pricingMode: draft.pricingMode,
      sellingPrice: priced,
      visibility: draft.visibility,
      marketplaceVisibility: draft.marketplaceVisibility,
      inventoryStrategy: draft.inventoryStrategy,
      inventoryStatus: draft.inventoryStatus,
      inventoryQuantity: numberOrNull(draft.inventoryQuantity),
      duplicateAction: draft.duplicateAction,
    };
    setMessage('');
    importProduct.mutate({ data: payload }, {
      onSuccess: (product) => {
        setMessage(`Saved “${product.title}” to your catalog. It is ${product.visibility === 'active' ? 'visible' : 'kept out of'} your storefront.`);
        setAnalysis(null);
        setDraft(null);
        setSourceUrl('');
        invalidateProducts();
      },
      onError: () => setMessage('The reviewed product could not be saved. Check the required fields and duplicate decision.'),
    });
  };

  const runBatch = (event: FormEvent) => {
    event.preventDefault();
    const urls = batchUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (!urls.length) return;
    batchImport.mutate({ data: { sourceUrls: urls, profitType: batchProfitType, profitValue: Number(batchProfitValue) || 0, inventoryStrategy: batchInventory, duplicateAction: batchDuplicateAction } }, {
      onSuccess: (result) => {
        setBatchResults(result.results as Record<string, unknown>[]);
        setMessage(`Batch ${result.batchId} completed with ${result.results.length} item results. Review each outcome before sharing products.`);
        invalidateProducts();
      },
      onError: () => setMessage('The batch could not be processed. Use one public URL per line and try again.'),
    });
  };

  const saveManual = (event: FormEvent) => {
    event.preventDefault();
    manualImport.mutate({ data: {
      title: manual.title,
      supplierName: manual.supplierName || null,
      supplierUrl: manual.supplierUrl || null,
      description: manual.description || null,
      imageUrl: manual.imageUrl || null,
      price: numberOrNull(manual.price),
      sellingPrice: Number(manual.sellingPrice),
      salePrice: numberOrNull(manual.salePrice),
      currency: manual.currency,
      sku: manual.sku || null,
      category: manual.category || null,
      inventoryStrategy: manual.inventoryStrategy,
      inventoryStatus: manual.inventoryStatus,
      inventoryQuantity: numberOrNull(manual.inventoryQuantity),
    } }, {
      onSuccess: (product) => {
        setMessage(`Manual product “${product.title}” saved. Add the public source later if the supplier makes it available.`);
        setManual({ title: '', supplierName: '', supplierUrl: '', description: '', imageUrl: '', price: '', sellingPrice: '', salePrice: '', currency: 'USD', sku: '', category: '', inventoryStrategy: 'manual', inventoryStatus: 'available', inventoryQuantity: '' });
        invalidateProducts();
      },
      onError: () => setMessage('The manual product could not be saved. Add a title, currency, and selling price.'),
    });
  };

  const startSupplierEdit = (supplier: NonNullable<typeof suppliers.data>[number]) => {
    setSupplierEditId(supplier.id);
    setSupplierDraft({ name: supplier.name, contactEmail: supplier.contactEmail ?? '', contactPhone: supplier.contactPhone ?? '', category: supplier.category ?? '', notes: supplier.notes ?? '' });
  };

  const saveSupplier = (event: FormEvent, id: number) => {
    event.preventDefault();
    updateSupplier.mutate({ id, data: { name: supplierDraft.name, contactEmail: supplierDraft.contactEmail || null, contactPhone: supplierDraft.contactPhone || null, category: supplierDraft.category || null, notes: supplierDraft.notes || null } }, {
      onSuccess: () => {
        setMessage('Supplier details updated.');
        setSupplierEditId(null);
        invalidateSuppliers();
      },
      onError: () => setMessage('Supplier details could not be updated.'),
    });
  };

  const runRefresh = (id: number) => {
    refresh.mutate({ id }, {
      onSuccess: (result) => {
        setRefreshResult(result);
        setAcceptedFields(result.changes.map((change) => refreshField(change as Record<string, unknown>)).filter(Boolean));
      },
      onError: () => setMessage('The source could not be refreshed. The saved catalog record is unchanged.'),
    });
  };

  const acceptSelectedRefresh = (id: number) => {
    acceptRefresh.mutate({ id, data: { fields: acceptedFields as SupplierRefreshAcceptInputFieldsItem[] } }, {
      onSuccess: () => {
        setMessage('Selected source changes accepted. Pricing, visibility, and inventory controls were left untouched.');
        setRefreshResult(null);
        invalidateProducts();
      },
      onError: () => setMessage('Those source changes could not be accepted. Nothing was changed.'),
    });
  };

  const startProductEdit = (product: NonNullable<typeof products.data>[number]) => {
    setProductEditId(product.id);
    setProductEdit({
      title: product.title,
      description: product.description ?? '',
      imageUrl: product.imageUrl ?? '',
      sellingPrice: product.sellingPrice === null ? '' : String(product.sellingPrice),
      visibility: product.visibility as Visibility,
      inventoryStrategy: product.inventoryStrategy as InventoryStrategy,
      inventoryStatus: product.inventoryStatus,
      inventoryQuantity: product.availabilityQuantity === null ? '' : String(product.availabilityQuantity),
    });
  };

  const saveProductEdit = (event: FormEvent, id: number) => {
    event.preventDefault();
    updateProduct.mutate({
      id,
      data: {
        title: productEdit.title,
        description: productEdit.description || null,
        imageUrl: productEdit.imageUrl || null,
        sellingPrice: numberOrNull(productEdit.sellingPrice),
        visibility: productEdit.visibility,
        inventoryStrategy: productEdit.inventoryStrategy,
        inventoryStatus: productEdit.inventoryStatus || undefined,
        inventoryQuantity: numberOrNull(productEdit.inventoryQuantity),
      },
    }, {
      onSuccess: () => {
        setProductEditId(null);
        setMessage('Catalog listing updated without changing its source record.');
        invalidateProducts();
      },
      onError: () => setMessage('The catalog listing could not be updated. Active listings need a selling price.'),
    });
  };

  if (products.isLoading || suppliers.isLoading || history.isLoading) return <AppShell><LoadingState label="Loading supplier workspace" /></AppShell>;
  if (products.isError || suppliers.isError || history.isError || !products.data || !suppliers.data || !history.data) return <AppShell><ErrorState onRetry={() => { void products.refetch(); void suppliers.refetch(); void history.refetch(); }} /></AppShell>;

  return <AppShell>
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Supplier workspace</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Bring in the source. Keep the decision.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Analyze a public product page before it enters your catalog. You decide what customers see, what it costs, and how inventory is represented.</p></div>
        <Badge tone="info">{products.data.length} catalog {products.data.length === 1 ? 'item' : 'items'}</Badge>
      </div>
      {message && <div className="mt-7"><Notice tone={message.includes('could not') || message.includes('couldn’t') ? 'danger' : 'success'} title={message.includes('could not') || message.includes('couldn’t') ? 'Action not completed' : 'Workspace updated'}>{message}</Notice></div>}

      <section className="mt-8 rounded-xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
        <SectionHeading eyebrow="Step 01 · Analyze first" title="Start with a public product URL" description="Nothing is saved until you review the extracted facts below." />
        <form onSubmit={runAnalyze} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1 text-sm font-bold">Product page URL<input data-testid="input-source-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://supplier.example/products/..." className={darkInputClass} /></label>
          <div className="sm:self-end"><SubmitButton loading={analyze.isPending}><Link2 className="h-4 w-4" />Analyze page</SubmitButton></div>
        </form>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#b9c4cf]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#d6aa46]" />Use public pages only. Login-only pages and blocked pages are not guessed or bypassed.</p>
      </section>

      {analysis && draft && <section className="mt-8 rounded-xl border border-[#bca26a] bg-[#fbfaf6] p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><SectionHeading eyebrow="Step 02 · Review extracted facts" title="Make this record yours" description={`Read from ${analysis.preview.sourceDomain}. Edit anything before saving.`} /><Badge tone={analysis.duplicates.length ? 'warning' : 'success'}>{analysis.duplicates.length ? `${analysis.duplicates.length} possible duplicate${analysis.duplicates.length === 1 ? '' : 's'}` : 'No duplicate found'}</Badge></div>
        {analysis.duplicates.length > 0 && <div className="mb-6 rounded-lg border border-[#dfc27a] bg-[#fff7df] p-4"><p className="flex items-center gap-2 text-sm font-extrabold text-[#765817]"><AlertTriangle className="h-4 w-4" />Choose what to do with the possible duplicate.</p><div className="mt-3 space-y-2">{analysis.duplicates.map((duplicate) => <div key={duplicate.id} className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#765817]"><span><strong>{duplicate.title}</strong> · {duplicate.matchReason}</span><a data-testid={`link-duplicate-${duplicate.id}`} href={duplicate.sourceUrl} target="_blank" rel="noreferrer" className="font-bold underline">Open record <ExternalLink className="inline h-3 w-3" /></a></div>)}</div><div className="mt-4 flex flex-wrap gap-2">{(['review', 'update_existing', 'create_new', 'skip'] as DuplicateAction[]).map((action) => <button data-testid={`button-duplicate-${action}`} type="button" key={action} onClick={() => setDraftValue('duplicateAction', action)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${draft.duplicateAction === action ? 'border-[#85601b] bg-[#85601b] text-white' : 'border-[#dfc27a] text-[#765817]'}`}>{action.replaceAll('_', ' ')}</button>)}</div></div>}
        <form onSubmit={saveAnalyzed} className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Title<input data-testid="input-preview-title" value={draft.title} onChange={(event) => setDraftValue('title', event.target.value)} required minLength={2} className={inputClass} /></label><label className="text-sm font-bold">Supplier URL<input data-testid="input-preview-supplier-url" type="url" value={draft.supplierUrl} onChange={(event) => setDraftValue('supplierUrl', event.target.value)} className={inputClass} /></label></div>
            <label className="block text-sm font-bold">Description<textarea data-testid="input-preview-description" value={draft.description} onChange={(event) => setDraftValue('description', event.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm text-[#182333] outline-none focus:border-[#bca26a]" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Image URL<input data-testid="input-preview-image" type="url" value={draft.imageUrl} onChange={(event) => setDraftValue('imageUrl', event.target.value)} className={inputClass} /></label><label className="text-sm font-bold">SKU<input data-testid="input-preview-sku" value={draft.sku} onChange={(event) => setDraftValue('sku', event.target.value)} className={inputClass} /></label></div>
            <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-bold">Category<input data-testid="input-preview-category" value={draft.category} onChange={(event) => setDraftValue('category', event.target.value)} className={inputClass} /></label><label className="text-sm font-bold">Brand<input data-testid="input-preview-brand" value={draft.brand} onChange={(event) => setDraftValue('brand', event.target.value)} className={inputClass} /></label><label className="text-sm font-bold">Tags <span className="font-normal text-[#697687]">(comma separated)</span><input data-testid="input-preview-tags" value={draft.tags} onChange={(event) => setDraftValue('tags', event.target.value)} className={inputClass} /></label></div>
            <div className="rounded-lg bg-[#f3efe5] p-4 text-xs"><p className="font-mono uppercase tracking-[.12em] text-[#a2772e]">Extracted facts</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><span className="text-[#697687]">Source price</span><strong className="mt-1 block font-mono">{draft.preview.price === null ? 'Unavailable' : money(draft.preview.price, draft.preview.currency)}</strong></div><div><span className="text-[#697687]">Availability</span><strong className="mt-1 block">{draft.preview.availability || 'Not available'}</strong></div><div><span className="text-[#697687]">Source ID</span><strong className="mt-1 block break-all font-mono">{draft.preview.sourceProductId || 'Not available'}</strong></div></div></div>
          </div>
          <div className="space-y-4 rounded-xl border border-[#ded8cd] bg-[#f3efe5] p-5">
            <p className="flex items-center gap-2 text-sm font-extrabold"><ListChecks className="h-4 w-4 text-[#a2772e]" />Price, visibility, inventory</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><label className="text-sm font-bold">Cost basis<input data-testid="input-pricing-cost" type="number" min="0" step="0.01" value={draft.costPrice} onChange={(event) => setDraftValue('costPrice', event.target.value)} className={inputClass} /></label><label className="text-sm font-bold">Currency<input data-testid="input-pricing-currency" maxLength={3} value={draft.currency} onChange={(event) => setDraftValue('currency', event.target.value.toUpperCase())} className={inputClass} /></label></div>
            <label className="block text-sm font-bold">Pricing mode<select data-testid="select-pricing-mode" value={draft.pricingMode} onChange={(event) => setDraftValue('pricingMode', event.target.value as PricingMode)} className={inputClass}><option value="same_price">Same price as cost</option><option value="fixed_markup">Fixed markup</option><option value="percentage_markup">Percentage markup</option><option value="fixed_margin">Fixed margin percentage</option><option value="custom">Custom selling price</option></select></label>
            {draft.pricingMode === 'custom' ? <label className="block text-sm font-bold">Selling price<input data-testid="input-custom-selling-price" type="number" min="0.01" step="0.01" value={draft.sellingPrice} onChange={(event) => setDraftValue('sellingPrice', event.target.value)} required className={inputClass} /></label> : <label className="block text-sm font-bold">{draft.pricingMode === 'same_price' ? 'Markup value' : draft.pricingMode === 'fixed_markup' ? 'Markup amount' : 'Margin percentage'}<input data-testid="input-profit-value" type="number" min="0" step="0.01" value={draft.profitValue} onChange={(event) => setDraftValue('profitValue', event.target.value)} className={inputClass} /></label>}
            <div className="rounded-lg border border-[#b8d6ca] bg-[#eff8f3] p-3"><p className="text-xs text-[#315e6c]">Calculated selling price</p><p data-testid="text-calculated-selling-price" className="mt-1 font-mono text-xl font-bold text-[#2f6958]">{priced === null ? 'Add a cost' : money(priced, draft.currency)}</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><label className="text-sm font-bold">Visibility<select data-testid="select-visibility" value={draft.visibility} onChange={(event) => setDraftValue('visibility', event.target.value as Visibility)} className={inputClass}><option value="draft">Draft</option><option value="active">Active in storefront</option><option value="hidden">Hidden</option></select></label><label className="text-sm font-bold">Inventory strategy<select data-testid="select-inventory-strategy" value={draft.inventoryStrategy} onChange={(event) => setDraftValue('inventoryStrategy', event.target.value as InventoryStrategy)} className={inputClass}><option value="manual">Manual</option><option value="source_based">Based on source</option><option value="synchronized">Synchronized</option></select></label></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><label className="text-sm font-bold">Inventory status<input data-testid="input-inventory-status" value={draft.inventoryStatus} onChange={(event) => setDraftValue('inventoryStatus', event.target.value)} className={inputClass} /></label><label className="text-sm font-bold">Quantity <span className="font-normal text-[#697687]">(optional)</span><input data-testid="input-inventory-quantity" type="number" min="0" step="1" value={draft.inventoryQuantity} onChange={(event) => setDraftValue('inventoryQuantity', event.target.value)} className={inputClass} /></label></div>
            <label className="flex items-start gap-2 text-xs text-[#536174]"><input data-testid="input-marketplace-visibility" type="checkbox" checked={draft.marketplaceVisibility} onChange={(event) => setDraftValue('marketplaceVisibility', event.target.checked)} className="mt-0.5 accent-[#85601b]" />Allow this product to appear in marketplace surfaces</label>
            <div className="pt-1">{rightsNotice()}</div>
            <SubmitButton loading={importProduct.isPending}><Check className="h-4 w-4" />Save reviewed product</SubmitButton>
          </div>
        </form>
      </section>}

       <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button data-testid="button-open-batch-import" type="button" onClick={() => setBatchOpen((open) => !open)} className="flex items-start gap-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 text-left hover:border-[#bca26a]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><Upload className="h-5 w-5" /></span><span><strong className="block text-sm">Batch import public links</strong><span className="mt-1 block text-xs leading-5 text-[#697687]">Paste one URL per line. Each item returns its own status and message.</span></span></button>
        <button data-testid="button-open-manual-entry" type="button" onClick={() => setManualOpen((open) => !open)} className="flex items-start gap-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 text-left hover:border-[#bca26a]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><FileText className="h-5 w-5" /></span><span><strong className="block text-sm">Enter product manually</strong><span className="mt-1 block text-xs leading-5 text-[#697687]">A deliberate fallback for blocked, private, or incomplete supplier pages.</span></span></button>
      </div>

       {batchOpen && <section className="mt-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Fallback workflow" title="Batch import, one URL per line" description="Up to 20 public URLs. The API returns per-item results; unsuccessful links do not become guessed products." /><form onSubmit={runBatch} className="grid gap-4 lg:grid-cols-[1fr_.75fr]"><label className="text-sm font-bold">Public product URLs<textarea data-testid="input-batch-urls" value={batchUrls} onChange={(event) => setBatchUrls(event.target.value)} required rows={7} placeholder={'https://supplier.example/item-a\nhttps://supplier.example/item-b'} className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 font-mono text-xs outline-none focus:border-[#bca26a]" /></label><div className="space-y-4"><label className="block text-sm font-bold">Batch pricing<select data-testid="select-batch-profit-type" value={batchProfitType} onChange={(event) => setBatchProfitType(event.target.value as 'fixed' | 'percentage')} className={inputClass}><option value="fixed">Fixed markup</option><option value="percentage">Percentage markup</option></select></label><label className="block text-sm font-bold">Markup value<input data-testid="input-batch-profit-value" type="number" min="0" step="0.01" value={batchProfitValue} onChange={(event) => setBatchProfitValue(event.target.value)} className={inputClass} /></label><label className="block text-sm font-bold">Inventory strategy<select data-testid="select-batch-inventory" value={batchInventory} onChange={(event) => setBatchInventory(event.target.value as InventoryStrategy)} className={inputClass}><option value="manual">Manual</option><option value="source_based">Based on source</option><option value="synchronized">Synchronized</option></select></label><label className="block text-sm font-bold">Duplicate handling<select data-testid="select-batch-duplicate-action" value={batchDuplicateAction} onChange={(event) => setBatchDuplicateAction(event.target.value as DuplicateAction)} className={inputClass}><option value="review">Flag for review</option><option value="update_existing">Update existing</option><option value="create_new">Create new</option><option value="skip">Skip duplicate</option></select></label><SubmitButton loading={batchImport.isPending}><Upload className="h-4 w-4" />Run batch import</SubmitButton></div></form>{batchResults.length > 0 && <div className="mt-6 space-y-2"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#a2772e]">Per-item results</p>{batchResults.map((item, index) => <div data-testid={`batch-result-${index}`} key={`${String(item.sourceUrl ?? item.url ?? index)}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ded8cd] bg-[#f3efe5] p-3 text-xs"><span className="min-w-0 flex-1 truncate font-mono">{String(item.sourceUrl ?? item.url ?? item.title ?? `Item ${index + 1}`)}</span><Badge tone={String(item.status ?? '').toLowerCase().includes('fail') || String(item.status ?? '').toLowerCase().includes('duplicate') ? 'danger' : 'success'}>{String(item.status ?? item.message ?? 'processed')}</Badge><span className="w-full text-[#697687] sm:w-auto">{String(item.message ?? item.error ?? '')}</span></div>)}</div>}</section>}

      {manualOpen && <section className="mt-4 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6"><SectionHeading eyebrow="Manual fallback" title="Copy the facts you can verify" description="Use this when a supplier page cannot be analyzed. Keep the supplier link for your own fulfillment reference." /><form onSubmit={saveManual} className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Product title<input data-testid="input-manual-title" value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} required className={inputClass} /></label><label className="text-sm font-bold">Supplier name<input data-testid="input-manual-supplier-name" value={manual.supplierName} onChange={(event) => setManual({ ...manual, supplierName: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Supplier URL<input data-testid="input-manual-supplier-url" type="url" value={manual.supplierUrl} onChange={(event) => setManual({ ...manual, supplierUrl: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Image URL<input data-testid="input-manual-image" type="url" value={manual.imageUrl} onChange={(event) => setManual({ ...manual, imageUrl: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold md:col-span-2">Description<textarea data-testid="input-manual-description" value={manual.description} onChange={(event) => setManual({ ...manual, description: event.target.value })} rows={3} className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm outline-none focus:border-[#bca26a]" /></label><div className="grid gap-4 sm:grid-cols-3 md:col-span-2"><label className="text-sm font-bold">Cost<input data-testid="input-manual-cost" type="number" min="0" step="0.01" value={manual.price} onChange={(event) => setManual({ ...manual, price: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Selling price<input data-testid="input-manual-selling-price" type="number" min="0.01" step="0.01" value={manual.sellingPrice} onChange={(event) => setManual({ ...manual, sellingPrice: event.target.value })} required className={inputClass} /></label><label className="text-sm font-bold">Currency<input data-testid="input-manual-currency" maxLength={3} value={manual.currency} onChange={(event) => setManual({ ...manual, currency: event.target.value.toUpperCase() })} required className={inputClass} /></label></div><div className="grid gap-4 sm:grid-cols-3 md:col-span-2"><label className="text-sm font-bold">SKU<input data-testid="input-manual-sku" value={manual.sku} onChange={(event) => setManual({ ...manual, sku: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Category<input data-testid="input-manual-category" value={manual.category} onChange={(event) => setManual({ ...manual, category: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Sale price<input data-testid="input-manual-sale-price" type="number" min="0" step="0.01" value={manual.salePrice} onChange={(event) => setManual({ ...manual, salePrice: event.target.value })} className={inputClass} /></label></div><div className="grid gap-4 sm:grid-cols-3 md:col-span-2"><label className="text-sm font-bold">Inventory strategy<select data-testid="select-manual-inventory-strategy" value={manual.inventoryStrategy} onChange={(event) => setManual({ ...manual, inventoryStrategy: event.target.value as InventoryStrategy })} className={inputClass}><option value="manual">Manual</option><option value="source_based">Based on source</option><option value="synchronized">Synchronized</option></select></label><label className="text-sm font-bold">Inventory status<input data-testid="input-manual-inventory-status" value={manual.inventoryStatus} onChange={(event) => setManual({ ...manual, inventoryStatus: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Quantity<input data-testid="input-manual-inventory-quantity" type="number" min="0" step="1" value={manual.inventoryQuantity} onChange={(event) => setManual({ ...manual, inventoryQuantity: event.target.value })} className={inputClass} /></label></div><div className="md:col-span-2">{rightsNotice()}</div><div className="md:col-span-2"><SubmitButton loading={manualImport.isPending}><Check className="h-4 w-4" />Save manual product</SubmitButton></div></form></section>}

      <section className="mt-10"><SectionHeading eyebrow="Catalog records" title="Imported products" description="Refresh source facts selectively. Your price, visibility, and inventory settings stay under your control." action={<Button variant="ghost" onClick={() => void products.refetch()} data-testid="button-refresh-products"><RefreshCw className="h-4 w-4" />Refresh</Button>} />{products.data.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.data.map((product) => { const productRefresh = refreshResult?.product.id === product.id ? refreshResult : null; return <article data-testid={`card-product-${product.id}`} key={product.id} className="overflow-hidden rounded-xl border border-[#d9d2c4] bg-[#fbfaf6]"><div className="h-40 bg-[#eee9df]">{product.imageUrl ? <img data-testid={`img-product-${product.id}`} src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#a2772e]"><Store className="h-8 w-8" /></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#a2772e]">{product.sourceDomain}</p><h3 data-testid={`text-product-title-${product.id}`} className="mt-2 line-clamp-2 font-extrabold">{product.title}</h3></div><Badge tone={product.visibility === 'active' ? 'success' : product.visibility === 'hidden' ? 'neutral' : 'warning'}>{product.visibility}</Badge></div>{product.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#697687]">{product.description}</p>}<div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-[#f3efe5] p-3 text-xs"><div><p className="text-[#697687]">Supplier cost</p><p className="mt-1 font-mono font-bold">{product.price === null ? 'Unavailable' : money(product.price, product.currency)}</p></div><div><p className="text-[#697687]">Your price</p><p data-testid={`text-product-price-${product.id}`} className="mt-1 font-mono font-bold text-[#2f6958]">{product.sellingPrice === null ? 'Needs price' : money(product.sellingPrice, product.currency)}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Badge tone="info">{product.inventoryStrategy}</Badge><Badge tone={product.status === 'ready' ? 'success' : 'warning'}>{product.status}</Badge></div><div className="mt-5 flex flex-wrap gap-3"><a data-testid={`link-product-source-${product.id}`} href={product.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8a6826] underline">Product page <ExternalLink className="h-3 w-3" /></a><Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => runRefresh(product.id)} disabled={refresh.isPending} data-testid={`button-refresh-product-${product.id}`}><RefreshCw className="h-3.5 w-3.5" />Check source</Button></div>{productRefresh && <div className="mt-5 rounded-lg border border-[#bfd6dc] bg-[#eef7f8] p-3"><p className="text-xs font-extrabold text-[#315e6c]">Source changes found</p>{productRefresh.changes.length ? <div className="mt-2 space-y-2">{productRefresh.changes.map((change, index) => { const record = change as Record<string, unknown>; const field = refreshField(record); const selected = acceptedFields.includes(field); return <label key={`${field}-${index}`} className="flex items-start gap-2 text-xs text-[#315e6c]"><input data-testid={`checkbox-refresh-${product.id}-${index}`} type="checkbox" checked={selected} disabled={!field} onChange={(event) => setAcceptedFields((current) => event.target.checked ? [...new Set([...current, field])] : current.filter((item) => item !== field))} className="mt-0.5 accent-[#316071]" /><span><strong>{field || 'Unrecognized source field'}</strong><span className="mt-0.5 block">{formatValue(record.oldValue ?? record.before)} <span className="px-1">→</span> {formatValue(record.newValue ?? record.after)}</span></span></label>; })}</div> : <p className="mt-2 text-xs text-[#315e6c]">{productRefresh.message}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-8 px-3 text-xs" onClick={() => acceptSelectedRefresh(product.id)} disabled={acceptRefresh.isPending || !acceptedFields.length} data-testid={`button-accept-refresh-${product.id}`}><Check className="h-3.5 w-3.5" />Accept selected</Button><Button variant="ghost" className="min-h-8 px-3 text-xs" onClick={() => setRefreshResult(null)} data-testid={`button-dismiss-refresh-${product.id}`}>Keep current</Button></div></div>}</div></article>; })}</div> : <EmptyState title="No supplier products yet" description="Analyze a public supplier product URL above, then save the reviewed record." />}</section>

      <section className="mt-10"><SectionHeading eyebrow="Supplier directory" title="Suppliers you work with" description="Keep contact details and operating notes beside the source records." />{suppliers.data.length ? <div className="space-y-3">{suppliers.data.map((supplier) => <article data-testid={`card-supplier-${supplier.id}`} key={supplier.id} className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8e0cd] text-[#85601b]"><Store className="h-5 w-5" /></div><div><h3 className="font-extrabold">{supplier.name}</h3><p className="mt-1 text-xs text-[#697687]">{supplier.domain} · {supplier.productCount} linked product{supplier.productCount === 1 ? '' : 's'}</p></div></div><Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => startSupplierEdit(supplier)} data-testid={`button-edit-supplier-${supplier.id}`}><Pencil className="h-3.5 w-3.5" />Edit details</Button></div>{supplierEditId === supplier.id && <form onSubmit={(event) => saveSupplier(event, supplier.id)} className="mt-5 grid gap-4 border-t border-[#ded8cd] pt-5 md:grid-cols-2"><label className="text-sm font-bold">Name<input data-testid={`input-supplier-name-${supplier.id}`} value={supplierDraft.name} onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })} required className={inputClass} /></label><label className="text-sm font-bold">Contact email<input data-testid={`input-supplier-email-${supplier.id}`} type="email" value={supplierDraft.contactEmail} onChange={(event) => setSupplierDraft({ ...supplierDraft, contactEmail: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Contact phone<input data-testid={`input-supplier-phone-${supplier.id}`} value={supplierDraft.contactPhone} onChange={(event) => setSupplierDraft({ ...supplierDraft, contactPhone: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold">Category<input data-testid={`input-supplier-category-${supplier.id}`} value={supplierDraft.category} onChange={(event) => setSupplierDraft({ ...supplierDraft, category: event.target.value })} className={inputClass} /></label><label className="text-sm font-bold md:col-span-2">Notes<textarea data-testid={`input-supplier-notes-${supplier.id}`} value={supplierDraft.notes} onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })} rows={3} className="mt-2 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm outline-none focus:border-[#bca26a]" /></label><div className="flex flex-wrap gap-2 md:col-span-2"><SubmitButton loading={updateSupplier.isPending}><Check className="h-4 w-4" />Save supplier</SubmitButton><Button type="button" variant="ghost" onClick={() => setSupplierEditId(null)} data-testid={`button-cancel-supplier-${supplier.id}`}>Cancel</Button></div></form>}</article>)}</div> : <EmptyState title="No supplier directory records yet" description="Supplier records are created as product sources are imported." />}</section>
    </div>
  </AppShell>;
}