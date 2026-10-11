import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";

type QuoteRequest = {
  id: string;
  supplierName: string | null;
  productTitle: string;
  sku: string | null;
  destinationCountry: string;
  currency: string;
  currencyMinorDigits: number;
  quantity: number;
  targetUnitPriceMinor: number | null;
  desiredDeliveryDays: number | null;
  requestNotes: string | null;
  expiresAt: string;
};
type QuotePortal = { quoteRequest: QuoteRequest; submission: "one_time_supplier_response" };
type PortalError = { error?: string };

const APP_BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, "");
function apiPath(path: string): string { return APP_BASE_PATH + (path.startsWith("/") ? path : "/" + path); }


async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({})) as T & PortalError;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "This request could not be completed.");
  return body as T;
}

function amountFromMinor(value: number | null, currency: string, digits: number): string {
  if (value === null || !Number.isSafeInteger(value)) return "Not specified";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
      .format(value / (10 ** digits));
  } catch {
    return currency + " " + (value / (10 ** digits)).toFixed(digits);
  }
}

const inputClass = "mt-1 h-12 w-full rounded-xl border border-[#d7dce3] bg-white px-3 text-sm text-[#14263a] outline-none focus:border-[#3d668b] focus:ring-2 focus:ring-[#3d668b]/10 disabled:bg-[#f3f5f8]";

export default function SupplierQuotePortal() {
  const [, params] = useRoute(apiPath("/supplier-quote/:token"));
  const token = params?.token ?? "";
  const [portal, setPortal] = useState<QuotePortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [shipping, setShipping] = useState("0");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [offerExpiresAt, setOfferExpiresAt] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError("");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setFatalError("This supplier response link is invalid or no longer available.");
      setLoading(false);
      return;
    }
    try {
      const data = await requestJson<QuotePortal>(apiPath("/api/public/supplier-quote/" + encodeURIComponent(token)));
      setPortal(data);
      setDeliveryDays(data.quoteRequest.desiredDeliveryDays ? String(data.quoteRequest.desiredDeliveryDays) : "");
    } catch (error) {
      setPortal(null);
      setFatalError(error instanceof Error ? error.message : "This supplier response link is invalid or no longer available.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    const request = portal?.quoteRequest;
    if (!request || submitted) return;
    const unit = unitPrice.trim();
    const ship = shipping.trim();
    const days = Number(deliveryDays);
    if (!/^\d+(?:\.\d+)?$/.test(unit) || !/^\d+(?:\.\d+)?$/.test(ship)) {
      setSubmitError("Enter unit price and shipping as non-negative decimal amounts in the requested currency.");
      return;
    }
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
      setSubmitError("Delivery estimate must be between 1 and 365 days.");
      return;
    }
    let normalizedExpiry: string | undefined;
    if (offerExpiresAt) {
      const parsed = new Date(offerExpiresAt);
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setSubmitError("Offer expiry must be a future date and time.");
        return;
      }
      normalizedExpiry = parsed.toISOString();
    }
    if (evidenceUrl.trim()) {
      try {
        const parsed = new URL(evidenceUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          setSubmitError("Evidence must be a valid HTTP(S) link without embedded credentials.");
          return;
        }
      } catch {
        setSubmitError("Enter a valid HTTP(S) evidence URL.");
        return;
      }
    }
    setSubmitting(true);
    try {
      await requestJson(apiPath("/api/public/supplier-quote/" + encodeURIComponent(token)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedUnitPrice: unit,
          quotedShipping: ship,
          quotedDeliveryDays: days,
          quoteExpiresAt: normalizedExpiry,
          quoteNotes: quoteNotes.trim() || null,
          quoteEvidenceUrl: evidenceUrl.trim() || null,
        }),
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Your offer could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const quote = portal?.quoteRequest;
  return <main className="min-h-[100dvh] bg-[#f3f5f8] px-4 py-8 text-[#15283b] sm:px-6 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <a href={APP_BASE_PATH + "/"} className="inline-flex items-center gap-2 text-sm font-black tracking-tight text-[#132b43]" aria-label="Return to Lunavo">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#132b43] text-sm text-white">L</span>Lunavo
        </a>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e2ea] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-[#52677a]">
          <ShieldCheck className="h-3.5 w-3.5"/> Supplier response
        </span>
      </header>

      {loading ? <section className="rounded-2xl border border-[#e0e5eb] bg-white p-10 text-center shadow-sm">
        <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-[#42647f]"/>
        <p className="mt-3 text-sm text-[#68788b]">Checking your private response link…</p>
      </section> : fatalError || !quote ? <section className="rounded-2xl border border-[#e0e5eb] bg-white p-7 shadow-sm sm:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#fff0ed] text-[#a33e38]"><TriangleAlert className="h-6 w-6"/></div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">This link cannot be used</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#68788b]">{fatalError || "This supplier response is no longer available."}</p>
        <p className="mt-5 text-xs leading-5 text-[#68788b]">For a new link or help, contact the merchant who shared it. Do not send payment, bank details, passwords, or identity documents through this form.</p>
        <a href={APP_BASE_PATH + "/"} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#42647f]"><ArrowLeft className="h-4 w-4"/>Return to Lunavo</a>
      </section> : submitted ? <section className="rounded-2xl border border-[#c6dfd3] bg-white p-7 shadow-sm sm:p-10">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f4ed] text-[#2f6958]"><CheckCircle2 className="h-6 w-6"/></div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-[#2f6958]">Offer submitted</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Your quote is with the merchant</h1>
        <p className="mt-3 text-sm leading-6 text-[#68788b]">Your offer for <strong className="text-[#15283b]">{quote.productTitle}</strong> has been recorded. This link can only be used once. The merchant must review the offer; your response does not place an order or trigger payment.</p>
        <div className="mt-6 rounded-xl bg-[#f3f7f5] p-4 text-sm text-[#365b4c]"><p className="font-bold">What happens next?</p><p className="mt-1 leading-6">The merchant can review your price and delivery estimate in their Lunavo sourcing workspace and contact you if clarification is needed.</p></div>
      </section> : <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <aside className="rounded-2xl bg-[#102b46] p-6 text-white shadow-sm sm:p-7">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-white/55">Supplier offer request</p>
          <h1 className="mt-3 text-2xl font-black leading-tight tracking-[-.04em] sm:text-3xl">{quote.productTitle}</h1>
          {quote.sku && <p className="mt-2 text-xs text-white/65">SKU: {quote.sku}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-white/55">Quantity</p><p className="mt-1 text-lg font-black">{quote.quantity.toLocaleString()}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-white/55">Destination</p><p className="mt-1 text-lg font-black">{quote.destinationCountry}</p></div>
          </div>
          <div className="mt-5 border-t border-white/15 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">Target unit price</p>
            <p className="mt-1 text-xl font-black">{amountFromMinor(quote.targetUnitPriceMinor, quote.currency, quote.currencyMinorDigits)}</p>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-white/55">Preferred delivery</p>
            <p className="mt-1 text-sm font-bold">{quote.desiredDeliveryDays ? "Within " + quote.desiredDeliveryDays + " days" : "Please provide an estimate"}</p>
          </div>
          {quote.requestNotes && <div className="mt-5 rounded-xl bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-white/55">Merchant notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/85">{quote.requestNotes}</p></div>}
          <p className="mt-6 inline-flex items-center gap-2 text-xs text-white/60"><Clock3 className="h-4 w-4"/> Link expires {new Date(quote.expiresAt).toLocaleString()}</p>
        </aside>

        <section className="rounded-2xl border border-[#e0e5eb] bg-white p-6 shadow-sm sm:p-8">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Your offer</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Submit price and lead time</h2>
          <p className="mt-2 text-sm leading-6 text-[#68788b]">Enter the total unit price and shipping in <strong>{quote.currency}</strong> for the requested quantity. The merchant will review your offer before any purchase is made.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold text-[#526073]">Unit price ({quote.currency})<input className={inputClass} inputMode="decimal" autoComplete="off" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} maxLength={80} placeholder={quote.currencyMinorDigits ? "12.50" : "12"} required disabled={submitting}/></label>
              <label className="block text-xs font-bold text-[#526073]">Shipping total ({quote.currency})<input className={inputClass} inputMode="decimal" autoComplete="off" value={shipping} onChange={e=>setShipping(e.target.value)} maxLength={80} required disabled={submitting}/></label>
            </div>
            <label className="block text-xs font-bold text-[#526073]">Delivery estimate (days)<input className={inputClass} type="number" min="1" max="365" step="1" value={deliveryDays} onChange={e=>setDeliveryDays(e.target.value)} placeholder="14" required disabled={submitting}/></label>
            <label className="block text-xs font-bold text-[#526073]">Offer expires at (optional)<input className={inputClass} type="datetime-local" value={offerExpiresAt} onChange={e=>setOfferExpiresAt(e.target.value)} disabled={submitting}/><span className="mt-1 block font-normal text-[#68788b]">Leave blank if your quoted price has no expiry.</span></label>
            <label className="block text-xs font-bold text-[#526073]">Evidence URL (optional)<input className={inputClass} type="url" inputMode="url" autoComplete="url" value={evidenceUrl} onChange={e=>setEvidenceUrl(e.target.value)} maxLength={2048} placeholder="https://supplier.example/offer" disabled={submitting}/><span className="mt-1 block font-normal text-[#68788b]">Use a public link to a quote document or product listing. Do not include passwords or secret links.</span></label>
            <label className="block text-xs font-bold text-[#526073]">Notes (optional)<textarea className="mt-1 min-h-24 w-full rounded-xl border border-[#d7dce3] bg-white p-3 text-sm text-[#14263a] outline-none focus:border-[#3d668b] disabled:bg-[#f3f5f8]" value={quoteNotes} onChange={e=>setQuoteNotes(e.target.value)} maxLength={3000} placeholder="Availability, warranty, shipping terms, variations or limitations…" disabled={submitting}/></label>
            {submitError && <div role="alert" className="rounded-xl border border-[#efc7c2] bg-[#fff4f2] p-3 text-sm text-[#a33e38]">{submitError}</div>}
            <button type="submit" disabled={submitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#132b43] px-4 text-sm font-black text-white hover:bg-[#204563] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><LoaderCircle className="h-4 w-4 animate-spin"/>Submitting securely…</> : <><CheckCircle2 className="h-4 w-4"/>Submit supplier offer</>}</button>
            <p className="text-[11px] leading-5 text-[#68788b]">This secure one-time link expires automatically. Submission records an offer only; it does not authorize an order, shipment, payment, or access to the merchant’s private account.</p>
          </form>
        </section>
      </div>}
      <footer className="mt-7 border-t border-[#dce3ea] pt-4 text-[10px] leading-5 text-[#7a8795]">
        Powered by Lunavo sourcing workflows. Private supplier links are single-use and expire automatically.
      </footer>
    </div>
  </main>;
}
