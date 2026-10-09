import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Boxes, CheckCircle2, CircleAlert, ClipboardList, Plus, RefreshCw, ShieldCheck, Truck } from "lucide-react";

type CostResult = {
  id: string;
  created_at: string;
  scenario_name: string;
  product_title?: string | null;
  destination_country: string;
  currency: string;
  quantity: number;
  landed_cost_minor: number;
  contribution_margin_minor: number;
  contribution_margin_bps: number;
  profitability: "profitable" | "break_even" | "loss";
};
type Quote = {
  id: string;
  supplier_product_id?: number | string | null;
  status: string;
  product_title: string;
  linked_product_title?: string | null;
  supplier_name?: string | null;
  source_url?: string | null;
  destination_country: string;
  currency: string;
  quantity: number;
  target_unit_price_minor?: number | null;
  quoted_unit_price_minor?: number | null;
  quoted_shipping_minor?: number | null;
  quoted_total_minor?: number | null;
  quoted_delivery_days?: number | null;
  quote_expires_at?: string | null;
  request_notes?: string | null;
  created_at: string;
  updated_at: string;
};
type CostForm = {
  scenarioName: string; supplierProductId: string; destinationCountry: string; currency: string; sourceCurrency: string; quantity: string;
  sourceCost: string; shipping: string; freight: string; insurance: string; handling: string; packaging: string; sellingPrice: string;
  dutyRate: string; taxRate: string; providerFeeRate: string; reserveRate: string; fxNote: string; fxUrl: string; evidenceNote: string;
};
type QuoteForm = {
  supplierProductId: string; supplierName: string; productTitle: string; sku: string; sourceUrl: string; destinationCountry: string;
  currency: string; quantity: string; targetPrice: string; desiredDays: string; requestNotes: string;
};
type QuoteEntryForm = { unitPrice: string; shipping: string; deliveryDays: string; expiresAt: string; notes: string; evidenceUrl: string };
type ProductOption = { id: number; title: string; sourceCurrency: string; sourceCostMinor: number | null; sellingPriceMinor: number | null };

const initialCost: CostForm = {
  scenarioName: "", supplierProductId: "", destinationCountry: "US", currency: "USD", sourceCurrency: "USD", quantity: "1",
  sourceCost: "", shipping: "0", freight: "0", insurance: "0", handling: "0", packaging: "0", sellingPrice: "",
  dutyRate: "0", taxRate: "0", providerFeeRate: "0", reserveRate: "0", fxNote: "", fxUrl: "", evidenceNote: "",
};
const initialQuote: QuoteForm = {
  supplierProductId: "", supplierName: "", productTitle: "", sku: "", sourceUrl: "", destinationCountry: "US",
  currency: "USD", quantity: "1", targetPrice: "", desiredDays: "", requestNotes: "",
};
const currencyDigits = (currency: string): number => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits; }
  catch { return 2; }
};
const amountToMinor = (raw: string, currency = "USD"): number | null => {
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const digits = currencyDigits(currency);
  const parts = text.split(".");
  if ((parts[1] ?? "").length > digits) return null;
  try {
    const value = BigInt(parts[0]!) * (10n ** BigInt(digits)) + BigInt(((parts[1] ?? "").padEnd(digits, "0")).slice(0, digits) || "0");
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  } catch { return null; }
};
const minorToMajor = (value: number | null | undefined, currency: string): string => {
  if (value == null || !Number.isSafeInteger(value)) return "";
  const digits = currencyDigits(currency);
  return (value / (10 ** digits)).toFixed(digits);
};
const percentToBps = (raw: string): number | null => {
  const text = raw.trim();
  if (!/^[0-9]{1,3}(?:\.[0-9]{1,2})?$/.test(text)) return null;
  const parts = text.split(".");
  const value = Number(parts[0]) * 100 + Number((parts[1] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= 10000 ? value : null;
};
const money = (minor: number | null | undefined, currency: string) => {
  if (minor == null || !Number.isFinite(Number(minor))) return "—";
  const digits = currencyDigits(currency);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(minor) / (10 ** digits)); }
  catch { return currency + " " + (Number(minor) / (10 ** digits)).toFixed(digits); }
};
const rate = (bps: number | null | undefined) => bps == null ? "—" : (Number(bps) / 100).toFixed(2) + "%";
const inputClass = "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "block text-xs font-bold text-muted-foreground";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-extrabold text-background disabled:opacity-50";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50";

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...(init?.headers ?? {}) }, ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The request failed.");
  return data;
}

function Field({ label, value, onChange, placeholder, required = false, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string;
}) {
  return <label className={labelClass}>{label}<input className={inputClass} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} type={type} step={type === "number" ? "any" : undefined} /></label>;
}

export default function DropshipWorkbench() {
  const [costForm, setCostForm] = useState<CostForm>(initialCost);
  const [quoteForm, setQuoteForm] = useState<QuoteForm>(initialQuote);
  const [costs, setCosts] = useState<CostResult[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [merchantCurrency, setMerchantCurrency] = useState("USD");
  const [lastCalculation, setLastCalculation] = useState<Record<string, unknown> | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [quoteEntry, setQuoteEntry] = useState<QuoteEntryForm>({ unitPrice: "", shipping: "0", deliveryDays: "", expiresAt: "", notes: "", evidenceUrl: "" });
  const [loading, setLoading] = useState(false);
  const [costSaving, setCostSaving] = useState(false);
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [costError, setCostError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [notice, setNotice] = useState("");
  const costFormRef = useRef<HTMLFormElement | null>(null);
  const costKey = useRef<string | null>(null);
  const quoteKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api("/api/merchant/dropship/workbench/landed-cost?limit=30"),
      api("/api/merchant/dropship/workbench/quotes"),
      api("/api/merchant/dropship/intelligence"),
    ]);
    if (results[0]?.status === "fulfilled") {
      setCosts(Array.isArray(results[0].value.scenarios) ? results[0].value.scenarios : []);
      setCostError("");
    } else {
      setCostError(results[0]?.reason instanceof Error ? results[0].reason.message : "Cost scenarios could not load. Finance permission may be required.");
    }
    if (results[1]?.status === "fulfilled") {
      setQuotes(Array.isArray(results[1].value.quotes) ? results[1].value.quotes : []);
      setQuoteError("");
    } else {
      setQuoteError(results[1]?.reason instanceof Error ? results[1].reason.message : "Supplier quote requests could not load. Fulfillment permission may be required.");
    }
    if (results[2]?.status === "fulfilled") {
      const graph = results[2].value as { merchant?: { currency?: string }; products?: Array<Record<string, unknown>> };
      const currency = typeof graph.merchant?.currency === "string" ? graph.merchant.currency.toUpperCase() : "USD";
      setMerchantCurrency(currency);
      setProducts((graph.products ?? []).map(row => ({
        id: Number(row.id),
        title: typeof row.title === "string" ? row.title : "",
        sourceCurrency: typeof row.sourceCurrency === "string" ? row.sourceCurrency.toUpperCase() : currency,
        sourceCostMinor: typeof row.sourceCostMinor === "number" && Number.isSafeInteger(row.sourceCostMinor) ? row.sourceCostMinor : null,
        sellingPriceMinor: typeof row.sellingPriceMinor === "number" && Number.isSafeInteger(row.sellingPriceMinor) ? row.sellingPriceMinor : null,
      })).filter(product => Number.isSafeInteger(product.id) && product.id > 0));
      setCostForm(current => current.scenarioName === "" && current.currency === "USD" && current.sourceCurrency === "USD"
        ? { ...current, currency, sourceCurrency: currency } : current);
      setQuoteForm(current => current.currency === "USD" ? { ...current, currency } : current);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setCost = (key: keyof CostForm, value: string) => { costKey.current = null; setCostForm(current => ({ ...current, [key]: value })); };
  const setQuote = (key: keyof QuoteForm, value: string) => { quoteKey.current = null; setQuoteForm(current => ({ ...current, [key]: value })); };

  const submitCost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCostError(""); setNotice("");
    const amounts = {
      sourceCostMinor: amountToMinor(costForm.sourceCost, costForm.currency),
      outboundShippingMinor: amountToMinor(costForm.shipping || "0", costForm.currency),
      freightMinor: amountToMinor(costForm.freight || "0", costForm.currency),
      insuranceMinor: amountToMinor(costForm.insurance || "0", costForm.currency),
      handlingMinor: amountToMinor(costForm.handling || "0", costForm.currency),
      packagingMinor: amountToMinor(costForm.packaging || "0", costForm.currency),
      sellingPriceMinor: amountToMinor(costForm.sellingPrice, costForm.currency),
    };
    const bps = {
      customsDutyBps: percentToBps(costForm.dutyRate || "0"),
      importTaxBps: percentToBps(costForm.taxRate || "0"),
      providerFeeBps: percentToBps(costForm.providerFeeRate || "0"),
      returnsReserveBps: percentToBps(costForm.reserveRate || "0"),
    };
    if (Object.values(amounts).some(value => value === null) || Object.values(bps).some(value => value === null)) {
      setCostError("Enter non-negative amounts using " + currencyDigits(costForm.currency) + " decimal place(s), and percentage rates from 0% to 100%.");
      return;
    }
    const quantity = Number(costForm.quantity);
    const productId = costForm.supplierProductId.trim() ? Number(costForm.supplierProductId) : null;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000 ||
        (productId !== null && (!Number.isSafeInteger(productId) || productId <= 0))) {
      setCostError("Quantity or linked product ID is invalid.");
      return;
    }
    setCostSaving(true);
    try {
      const result = await api("/api/merchant/dropship/workbench/landed-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioName: costForm.scenarioName, supplierProductId: productId, destinationCountry: costForm.destinationCountry,
          currency: costForm.currency, sourceCurrency: costForm.sourceCurrency, quantity, ...amounts, ...bps,
          fxNormalizationNote: costForm.fxNote, fxEvidenceUrl: costForm.fxUrl,
          evidence: { costAndRateNotes: costForm.evidenceNote, interface: "dropship-workbench" },
          idempotencyKey: costKey.current ?? (costKey.current = crypto.randomUUID()),
        }),
      });
      setLastCalculation(result);
      costKey.current = null;
      setNotice(result.replayed ? "The saved calculation was safely retrieved again." : "Landed-cost scenario saved.");
      await load();
    } catch (error) {
      setCostError(error instanceof Error ? error.message : "Could not save the scenario.");
    } finally { setCostSaving(false); }
  };

  const submitQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuoteError(""); setNotice("");
    const quantity = Number(quoteForm.quantity);
    const productId = quoteForm.supplierProductId.trim() ? Number(quoteForm.supplierProductId) : null;
    const targetPrice = quoteForm.targetPrice.trim() ? amountToMinor(quoteForm.targetPrice, quoteForm.currency) : null;
    const desiredDays = quoteForm.desiredDays.trim() ? Number(quoteForm.desiredDays) : null;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000 ||
        (productId !== null && (!Number.isSafeInteger(productId) || productId <= 0)) ||
        (quoteForm.targetPrice.trim() && targetPrice === null) ||
        (desiredDays !== null && (!Number.isSafeInteger(desiredDays) || desiredDays < 1 || desiredDays > 365))) {
      setQuoteError("Check the quantity, linked product ID, target price and delivery estimate.");
      return;
    }
    setQuoteSaving(true);
    try {
      const result = await api("/api/merchant/dropship/workbench/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierProductId: productId, supplierName: quoteForm.supplierName, productTitle: quoteForm.productTitle, sku: quoteForm.sku,
          sourceUrl: quoteForm.sourceUrl, destinationCountry: quoteForm.destinationCountry, currency: quoteForm.currency,
          quantity, targetUnitPriceMinor: targetPrice, desiredDeliveryDays: desiredDays, requestNotes: quoteForm.requestNotes,
          idempotencyKey: quoteKey.current ?? (quoteKey.current = crypto.randomUUID()),
        }),
      });
      quoteKey.current = null;
      setQuoteForm(initialQuote);
      setNotice(result.replayed ? "The existing supplier quote request was retrieved." : "Supplier quote request saved as a draft.");
      await load();
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Could not save supplier quote request.");
    } finally { setQuoteSaving(false); }
  };

  const recordQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeQuote) return;
    setQuoteError(""); setNotice("");
    const quoteCurrency = quotes.find(item => item.id === activeQuote)?.currency ?? "USD";
    const unitPrice = amountToMinor(quoteEntry.unitPrice, quoteCurrency);
    const shipping = amountToMinor(quoteEntry.shipping || "0", quoteCurrency);
    const deliveryDays = Number(quoteEntry.deliveryDays);
    if (unitPrice === null || shipping === null || !Number.isSafeInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 365) {
      setQuoteError("Enter a valid unit price, shipping amount and delivery estimate.");
      return;
    }
    setEntrySaving(true);
    try {
      await api("/api/merchant/dropship/workbench/quotes/" + activeQuote, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_quote", quotedUnitPriceMinor: unitPrice, quotedShippingMinor: shipping,
          quotedDeliveryDays: deliveryDays, quoteExpiresAt: quoteEntry.expiresAt ? new Date(quoteEntry.expiresAt).toISOString() : null,
          quoteNotes: quoteEntry.notes, quoteEvidenceUrl: quoteEntry.evidenceUrl || null,
        }),
      });
      setActiveQuote(null);
      setQuoteEntry({ unitPrice: "", shipping: "0", deliveryDays: "", expiresAt: "", notes: "", evidenceUrl: "" });
      setNotice("Supplier quote recorded. No message or purchase order was sent.");
      await load();
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Could not record supplier quote.");
    } finally { setEntrySaving(false); }
  };

  const useQuoteForCost = (item: Quote) => {
    const unitPrice = item.quoted_unit_price_minor == null ? null : Number(item.quoted_unit_price_minor);
    const totalShipping = Number(item.quoted_shipping_minor ?? 0);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    if (unitPrice === null || !Number.isSafeInteger(unitPrice) || unitPrice < 0 ||
        !Number.isSafeInteger(totalShipping) || totalShipping < 0) {
      setCostError("This quote does not contain a usable exact-integer price yet.");
      return;
    }
    const perUnitShipping = Number((BigInt(totalShipping) + BigInt(Math.floor(quantity / 2))) / BigInt(quantity));
    setCostError("");
    setCostForm(current => ({
      ...current,
      scenarioName: (item.product_title || item.linked_product_title || "Supplier quote").slice(0, 160) +
        " — " + (item.supplier_name || "supplier") + " — " + item.destination_country,
      supplierProductId: item.supplier_product_id == null ? current.supplierProductId : String(item.supplier_product_id),
      destinationCountry: item.destination_country,
      currency: item.currency,
      sourceCurrency: item.currency,
      quantity: String(quantity),
      sourceCost: (unitPrice / 100).toFixed(2),
      shipping: (perUnitShipping / 100).toFixed(2),
      evidenceNote: "Seeded from manually recorded supplier quote " + item.id +
        "; quote shipping total was allocated across " + quantity + " units. Verify freight, insurance, duties, tax and source evidence.",
    }));
    costKey.current = null;
    setNotice("Cost scenario prefilled from the recorded quote. Verify per-unit freight, currency, selling price and destination tax assumptions.");
    window.setTimeout(() => costFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const transitionQuote = async (id: string, action: "accept" | "reject" | "cancel" | "expire") => {
    setQuoteError(""); setNotice("");
    try {
      await api("/api/merchant/dropship/workbench/quotes/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      setNotice(action === "accept" ? "Quote acceptance recorded. No purchase order or payment was created." : "Quote status updated.");
      await load();
    } catch (error) { setQuoteError(error instanceof Error ? error.message : "Quote status could not be updated."); }
  };

  return <AppShell><div className="space-y-6">
    <section className="overflow-hidden rounded-[24px] border border-[#1c3f68] bg-[#0b2748] p-6 text-white sm:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-[#8fb8e8]">Connected dropshipping operations</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-[-.05em] sm:text-4xl">Know your real unit economics before you scale.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Compare per-unit landed cost, provider fees, returns reserve and contribution margin. Prepare supplier quote requests and record actual offers. Every amount is traceable; estimates never become payment or stock truth.</p><p className="mt-2 text-[10px] font-bold text-white/55">Detected merchant workspace currency: {merchantCurrency}. Currency and destination assumptions must be verified for each market.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#12345a]" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4"/>{loading ? "Refreshing…" : "Refresh workspace"}</button>
      </div>
    </section>

    {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><span>{notice}</span></div>}

    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <form ref={costFormRef} onSubmit={submitCost} className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-accent/10 p-2 text-accent"><Boxes className="h-5 w-5"/></div>
          <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Pricing intelligence</p><h2 className="mt-1 text-xl font-black">Landed-cost scenario</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">All amounts are per unit and must be entered in the calculation currency. Lunavo’s platform fee is fixed at 1%.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scenario name" value={costForm.scenarioName} onChange={v=>setCost("scenarioName",v)} placeholder="e.g. US market, air freight" required/>
          <label className={labelClass}>Linked product (optional)<select className={inputClass} value={costForm.supplierProductId} onChange={event => { const id=event.target.value; const p=products.find(item=>String(item.id)===id); setCostForm(current=>({...current,supplierProductId:id,...(p?{scenarioName:p.title.slice(0,120)+" - "+current.destinationCountry+" estimate",sourceCurrency:p.sourceCurrency,...(p.sourceCurrency===current.currency.toUpperCase()?{sourceCost:minorToMajor(p.sourceCostMinor,current.currency),sellingPrice:minorToMajor(p.sellingPriceMinor,current.currency)}:{})}:{})})); if(p&&p.sourceCurrency!==costForm.currency.toUpperCase())setNotice("Source price currency differs. Normalize the entered amounts and add the FX basis; no rate is inferred."); }}><option value="">Unlinked / custom quote</option>{products.map(p=><option key={p.id} value={p.id}>{p.title||("Product #"+p.id)} · {p.sourceCurrency}</option>)}</select></label>
          <Field label="Destination country (2 letters)" value={costForm.destinationCountry} onChange={v=>setCost("destinationCountry",v.toUpperCase())} placeholder="US" required/>
          <Field label="Calculation currency (3 letters)" value={costForm.currency} onChange={v=>setCost("currency",v.toUpperCase())} placeholder="USD" required/>
          <Field label="Source price currency" value={costForm.sourceCurrency} onChange={v=>setCost("sourceCurrency",v.toUpperCase())} placeholder="USD" required/>
          <Field label="Quantity in scenario" value={costForm.quantity} onChange={v=>setCost("quantity",v)} type="number" required/>
        </div>
        <div><h3 className="text-sm font-extrabold">Per-unit cost stack</h3><p className="mt-1 text-xs text-muted-foreground">Money fields accept up to two decimal places; enter 0 only when a cost is known to be zero or you explicitly want a zero-cost assumption.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Supplier cost" value={costForm.sourceCost} onChange={v=>setCost("sourceCost",v)} placeholder="12.50" required/>
          <Field label="Outbound shipping" value={costForm.shipping} onChange={v=>setCost("shipping",v)} placeholder="0.00" required/>
          <Field label="Freight" value={costForm.freight} onChange={v=>setCost("freight",v)} placeholder="0.00" required/>
          <Field label="Insurance" value={costForm.insurance} onChange={v=>setCost("insurance",v)} placeholder="0.00" required/>
          <Field label="Handling" value={costForm.handling} onChange={v=>setCost("handling",v)} placeholder="0.00" required/>
          <Field label="Packaging" value={costForm.packaging} onChange={v=>setCost("packaging",v)} placeholder="0.00" required/>
          <Field label="Selling price" value={costForm.sellingPrice} onChange={v=>setCost("sellingPrice",v)} placeholder="39.99" required/>
        </div>
        <div><h3 className="text-sm font-extrabold">Rates used in the estimate</h3><p className="mt-1 text-xs text-muted-foreground">Enter percentages, not basis points. The tax and duty calculation bases are explicit approximations and must be verified for the destination.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customs duty %" value={costForm.dutyRate} onChange={v=>setCost("dutyRate",v)} placeholder="0"/>
          <Field label="Import tax %" value={costForm.taxRate} onChange={v=>setCost("taxRate",v)} placeholder="0"/>
          <Field label="Payment-provider fee %" value={costForm.providerFeeRate} onChange={v=>setCost("providerFeeRate",v)} placeholder="0"/>
          <Field label="Returns reserve %" value={costForm.reserveRate} onChange={v=>setCost("reserveRate",v)} placeholder="0"/>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="FX normalization note (required if currencies differ)" value={costForm.fxNote} onChange={v=>setCost("fxNote",v)} placeholder="Rate and date used for conversion"/>
          <Field label="FX source URL (optional)" value={costForm.fxUrl} onChange={v=>setCost("fxUrl",v)} placeholder="https://..."/>
        </div>
        <Field label="Cost / tax / duty evidence notes" value={costForm.evidenceNote} onChange={v=>setCost("evidenceNote",v)} placeholder="Source quote, rate source, shipping basis, date observed"/>
        {costError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{costError}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="max-w-xl text-[11px] leading-5 text-muted-foreground">This is an estimate, not statutory tax advice or net profit. Unentered duties, discounts, refunds, overhead and unknown provider fees may change the actual result.</p>
          <button className={buttonClass} type="submit" disabled={costSaving}><ShieldCheck className="h-4 w-4"/>{costSaving ? "Calculating…" : "Calculate and save"}</button>
        </div>
      </form>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Saved scenarios</p><h2 className="mt-1 text-xl font-black">Cost history</h2>
          {costError && <p className="mt-3 text-xs font-semibold text-destructive">{costError}</p>}
          {costs.length===0 ? <p className="mt-4 text-sm text-muted-foreground">No saved landed-cost scenarios yet.</p> : <div className="mt-4 space-y-2">{costs.slice(0,12).map(item=><div key={item.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-extrabold">{item.scenario_name}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.product_title || "Unlinked product"} · {item.destination_country} · qty {item.quantity}</p></div><span className={"rounded-full px-2 py-1 text-[10px] font-black " + (item.profitability==="loss"?"bg-red-100 text-red-800":item.profitability==="break_even"?"bg-amber-100 text-amber-900":"bg-emerald-100 text-emerald-900")}>{item.profitability?.replace("_"," ")}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><div><p className="text-[10px] text-muted-foreground">Landed / unit</p><p className="text-sm font-black">{money(item.landed_cost_minor,item.currency)}</p></div><div><p className="text-[10px] text-muted-foreground">Contribution / unit</p><p className={"text-sm font-black "+(item.contribution_margin_minor<0?"text-red-700":"")}>{money(item.contribution_margin_minor,item.currency)}</p></div></div>
          </div>)}</div>}
        </div>
        {lastCalculation && <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Latest calculation</p>
          <p className="mt-1 text-sm font-extrabold">{String((lastCalculation.scenario as Record<string, unknown> | undefined)?.scenarioName ?? "")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/60 p-3"><p className="text-[10px] font-bold text-muted-foreground">Landed cost / unit</p><p className="mt-1 text-lg font-black">{money(Number((lastCalculation.scenario as Record<string, unknown> | undefined)?.landedCostMinor ?? 0),String((lastCalculation.scenario as Record<string, unknown> | undefined)?.currency ?? costForm.currency))}</p></div>
            <div className="rounded-xl bg-muted/60 p-3"><p className="text-[10px] font-bold text-muted-foreground">Contribution / unit</p><p className="mt-1 text-lg font-black">{money(Number((lastCalculation.scenario as Record<string, unknown> | undefined)?.contributionMarginMinor ?? 0),String((lastCalculation.scenario as Record<string, unknown> | undefined)?.currency ?? costForm.currency))}</p></div>
          </div>
          {Array.isArray(lastCalculation.warnings) && <div className="mt-3 space-y-1">{(lastCalculation.warnings as string[]).map(w=><p key={w} className="flex gap-2 text-[11px] leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{w}</p>)}</div>}
        </div>}
      </div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={submitQuote} className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-accent/10 p-2 text-accent"><ClipboardList className="h-5 w-5"/></div><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Supplier negotiation</p><h2 className="mt-1 text-xl font-black">Prepare a supplier quote</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Create a trackable draft, then enter the actual supplier response. This does not message the supplier.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Linked product (optional)<select className={inputClass} value={quoteForm.supplierProductId} onChange={event=>{const id=event.target.value;const p=products.find(item=>String(item.id)===id);setQuoteForm(current=>({...current,supplierProductId:id,...(p?{productTitle:p.title}:{})}));}}><option value="">Unlinked / custom product</option>{products.map(p=><option key={p.id} value={p.id}>{p.title||("Product #"+p.id)}</option>)}</select></label>
          <Field label="Supplier name" value={quoteForm.supplierName} onChange={v=>setQuote("supplierName",v)} placeholder="Supplier / factory"/>
          {!quoteForm.supplierProductId && <Field label="Product title (required if unlinked)" value={quoteForm.productTitle} onChange={v=>setQuote("productTitle",v)} placeholder="Product name" required/>}
          <Field label="SKU / variant reference" value={quoteForm.sku} onChange={v=>setQuote("sku",v)} placeholder="Optional"/>
          <Field label="Source URL" value={quoteForm.sourceUrl} onChange={v=>setQuote("sourceUrl",v)} placeholder="https://..."/>
          <Field label="Destination country" value={quoteForm.destinationCountry} onChange={v=>setQuote("destinationCountry",v.toUpperCase())} placeholder="US" required/>
          <Field label="Currency" value={quoteForm.currency} onChange={v=>setQuote("currency",v.toUpperCase())} placeholder="USD" required/>
          <Field label="Quantity" value={quoteForm.quantity} onChange={v=>setQuote("quantity",v)} type="number" required/>
          <Field label={"Target unit price (optional, "+quoteForm.currency+")"} value={quoteForm.targetPrice} onChange={v=>setQuote("targetPrice",v)} placeholder="12.50" type="number"/>
          <Field label="Desired delivery days" value={quoteForm.desiredDays} onChange={v=>setQuote("desiredDays",v)} placeholder="14" type="number"/>
        </div>
        <label className={labelClass}>Notes / questions for supplier<textarea className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-accent" value={quoteForm.requestNotes} onChange={e=>setQuote("requestNotes",e.target.value)} maxLength={3000} placeholder="Variant, packaging, MOQ, sample requirements, warranty, delivery lanes…"/></label>
        {quoteError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{quoteError}</div>}
        <button className={buttonClass} type="submit" disabled={quoteSaving}><Plus className="h-4 w-4"/>{quoteSaving ? "Saving draft…" : "Save supplier quote draft"}</button>
        <p className="text-[11px] leading-5 text-muted-foreground">No email, external API call, purchase order, payment or inventory mutation is performed.</p>
      </form>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Negotiation pipeline</p><h2 className="mt-1 text-xl font-black">Supplier quote requests</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-black">{quotes.length} records</span></div>
        {quoteError && <p className="mt-3 text-xs font-semibold text-destructive">{quoteError}</p>}
        {quotes.length===0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center"><Truck className="mx-auto h-6 w-6 text-muted-foreground"/><p className="mt-2 text-sm font-extrabold">No supplier offers recorded</p><p className="mt-1 text-xs text-muted-foreground">Create a draft to start comparing supplier prices and lead times.</p></div> : <div className="mt-4 space-y-3">{quotes.map(item=><div key={item.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold">{item.product_title || item.linked_product_title || "Supplier product"}</p><p className="mt-1 text-xs text-muted-foreground">{item.supplier_name || "Supplier not named"} · {item.destination_country} · {item.quantity} units</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.updated_at || item.created_at).toLocaleString()}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase">{item.status}</span></div>
          {item.status==="quoted" || item.status==="accepted" ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><div><p className="text-[10px] text-muted-foreground">Quoted / unit</p><p className="font-black">{money(item.quoted_unit_price_minor,item.currency)}</p></div><div><p className="text-[10px] text-muted-foreground">Shipping</p><p className="font-black">{money(item.quoted_shipping_minor,item.currency)}</p></div><div><p className="text-[10px] text-muted-foreground">Quoted total</p><p className="font-black">{money(item.quoted_total_minor,item.currency)}</p></div><div><p className="text-[10px] text-muted-foreground">Lead time</p><p className="font-black">{item.quoted_delivery_days ?? "—"} days</p></div></div> : null}
          {item.request_notes && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.request_notes}</p>}
          {item.source_url && <a className="mt-2 inline-block break-all text-xs font-bold text-accent underline" href={item.source_url} target="_blank" rel="noreferrer">Open supplier source</a>}
          {activeQuote===item.id && item.status==="draft" && <form onSubmit={recordQuote} className="mt-4 space-y-3 rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-extrabold">Record supplier response manually</p>
            <div className="grid gap-2 sm:grid-cols-2"><Field label="Unit price" value={quoteEntry.unitPrice} onChange={v=>setQuoteEntry(s=>({...s,unitPrice:v}))} placeholder="10.00" required/><Field label="Shipping total" value={quoteEntry.shipping} onChange={v=>setQuoteEntry(s=>({...s,shipping:v}))} placeholder="0.00" required/><Field label="Delivery days" value={quoteEntry.deliveryDays} onChange={v=>setQuoteEntry(s=>({...s,deliveryDays:v}))} type="number" required/><Field label="Quote expiry (optional)" value={quoteEntry.expiresAt} onChange={v=>setQuoteEntry(s=>({...s,expiresAt:v}))} type="datetime-local"/></div>
            <Field label="Evidence URL (optional)" value={quoteEntry.evidenceUrl} onChange={v=>setQuoteEntry(s=>({...s,evidenceUrl:v}))} placeholder="Supplier quote URL"/>
            <label className={labelClass}>Quote notes<textarea className="mt-1 min-h-16 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground" value={quoteEntry.notes} onChange={e=>setQuoteEntry(s=>({...s,notes:e.target.value}))} maxLength={3000}/></label>
            <div className="flex flex-wrap gap-2"><button type="submit" className={buttonClass} disabled={entrySaving}><CheckCircle2 className="h-4 w-4"/>{entrySaving ? "Saving…" : "Save quoted offer"}</button><button type="button" className={secondaryClass} onClick={()=>setActiveQuote(null)}>Close</button></div>
          </form>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(item.status==="quoted" || item.status==="accepted") && <button className={secondaryClass} onClick={()=>useQuoteForCost(item)}>Model this quote in landed cost</button>}
            {item.status==="draft" && <button className={secondaryClass} onClick={()=>{setActiveQuote(item.id);setQuoteError("");}}>Enter supplier quote</button>}
            {item.status==="quoted" && <><button className={secondaryClass} onClick={()=>void transitionQuote(item.id,"accept")}>Record acceptance</button><button className={secondaryClass} onClick={()=>void transitionQuote(item.id,"reject")}>Reject quote</button>{item.quote_expires_at && new Date(item.quote_expires_at).getTime()<=Date.now() && <button className={secondaryClass} onClick={()=>void transitionQuote(item.id,"expire")}>Mark expired</button>}</>}
            {item.status==="draft" && <button className={secondaryClass} onClick={()=>void transitionQuote(item.id,"cancel")}>Cancel draft</button>}
          </div>
          {item.status==="accepted" && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">Acceptance is recorded for negotiation tracking only. Create a separate reviewed purchase order and payment through the normal guarded workflows.</p>}
        </div>)}</div>}
      </div>
    </section>
  </div></AppShell>;
}
