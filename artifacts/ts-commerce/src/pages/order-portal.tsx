import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, PackageCheck, RefreshCw, RotateCcw, ShieldCheck, Truck } from "lucide-react";

type ReturnRequest = {
  id: string; type: "return" | "exchange"; quantity: number; reason: string; customerMessage?: string | null;
  status: string; createdAt: string; updatedAt: string;
};
type Portal = {
  store: { name: string; accentColor: string; storefrontPublished: boolean };
  order: {
    orderNumber: string; createdAt: string; currency: string; total: string; quantity: number; status: string;
    fulfillmentStatus: string; displayStatus: string;
    product?: { title: string; imageUrl: string | null } | null;
    tracking: { carrier: string | null; number: string | null; url: string | null; shippedAt: string | null; deliveredAt: string | null };
  };
  returns: { enabled: boolean; windowDays: number; daysSinceDelivery: number | null; windowOpen: boolean; remainingQuantity: number; requests: ReturnRequest[] };
  privacy: string;
};
const REASONS = [
  ["damaged", "Arrived damaged"], ["wrong_item", "Wrong item received"], ["not_as_described", "Not as described"],
  ["arrived_late", "Arrived later than expected"], ["changed_mind", "Changed my mind"],
  ["size_fit", "Size or fit issue"], ["other", "Other reason"],
] as const;
const REASON_LABEL: Record<string,string> = Object.fromEntries(REASONS);

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "omit", cache: "no-store",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The request could not be completed.");
  return body as T;
}
function money(value: string | number, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return currency + " " + String(value);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return currency + " " + amount.toFixed(2); }
}
function pretty(value: string) { return value.replaceAll("_", " "); }
const labelClass = "block text-xs font-bold text-[#526073]";
const inputClass = "mt-1 h-11 w-full rounded-xl border border-[#d7dce3] bg-white px-3 text-sm text-[#14263a] outline-none focus:border-[#3d668b]";

export default function OrderPortal() {
  const [, params] = useRoute("/track/:token");
  const token = params?.token ?? "";
  const [portal, setPortal] = useState<Portal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const [requestType, setRequestType] = useState<"return"|"exchange">("return");
  const [reason, setReason] = useState<string>("damaged");
  const [quantity, setQuantity] = useState("1");
  const [customerMessage, setCustomerMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const lastFingerprint = useRef<string>("");

  const load = useCallback(async (quiet = false) => {
    if (!token) { setError("This tracking link is invalid."); setLoading(false); return; }
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const data = await requestJson<Portal>("/api/public/order-portal/" + encodeURIComponent(token));
      setPortal(data);
      setError("");
      setQuantity(current => String(Math.max(1, Math.min(Math.max(1, data.returns.remainingQuantity), Number(current) || 1))));
    } catch (e) {
      setPortal(null);
      setError(e instanceof Error ? e.message : "This order could not be found.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const setField = (field: "requestType"|"reason"|"quantity"|"customerMessage", value: string) => {
    const next = JSON.stringify({ requestType: field === "requestType" ? value : requestType,
      reason: field === "reason" ? value : reason, quantity: field === "quantity" ? value : quantity,
      customerMessage: field === "customerMessage" ? value : customerMessage });
    if (lastFingerprint.current !== next) idempotencyKey.current = null;
    if (field === "requestType") setRequestType(value as "return"|"exchange");
    else if (field === "reason") setReason(value);
    else if (field === "quantity") setQuantity(value);
    else setCustomerMessage(value);
    lastFingerprint.current = next;
  };

  const submitReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(""); setMessage("");
    if (!portal?.returns.windowOpen || portal.returns.remainingQuantity < 1) {
      setSubmitError("This order is outside the return window or has no remaining returnable quantity."); return;
    }
    const qty = Number(quantity);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > portal.returns.remainingQuantity) {
      setSubmitError("Choose a quantity within the order's remaining returnable quantity."); return;
    }
    const payload = { requestType, reason, quantity: qty, customerMessage: customerMessage.trim() || null };
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setSubmitting(true);
    try {
      const result = await requestJson<{ request: ReturnRequest; replayed?: boolean }>(
        "/api/public/order-portal/" + encodeURIComponent(token) + "/returns",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: idempotencyKey.current }) },
      );
      idempotencyKey.current = null; lastFingerprint.current = ""; setCustomerMessage("");
      setMessage(result.replayed ? "Your existing request was retrieved. No duplicate was created." : "Your request has been sent to the store for review.");
      await load(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Your request could not be saved.");
    } finally { setSubmitting(false); }
  };

  const accent = portal?.store.accentColor && /^#[0-9a-f]{6}$/i.test(portal.store.accentColor) ? portal.store.accentColor : "#b8873b";
  const status = portal?.order.displayStatus ?? "";
  return <main className="min-h-screen bg-[#f3f5f8] text-[#15283b]">
    <header className="border-b border-[#e0e5eb] bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: accent }}><PackageCheck className="h-5 w-5"/></div>
          <div className="min-w-0"><p className="truncate text-sm font-black">{portal?.store.name ?? "Order portal"}</p><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#68788b]">Order tracking and returns</p></div>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#d7dce3] px-3 py-2 text-xs font-bold hover:bg-[#f4f6f9] disabled:opacity-50"><RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")}/>{refreshing ? "Refreshing" : "Refresh"}</button>
      </div>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
      {loading ? <div className="rounded-2xl border border-[#e0e5eb] bg-white p-10 text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#68788b]"/><p className="mt-3 text-sm text-[#68788b]">Loading your order status…</p></div>
      : error || !portal ? <div className="rounded-2xl border border-[#e0e5eb] bg-white p-8"><p className="text-sm font-black">We couldn’t open this order</p><p className="mt-2 text-sm leading-6 text-[#68788b]">{error || "This tracking link is not available."}</p><a href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold" style={{ color: accent }}><ArrowLeft className="h-4 w-4"/>Return to Lunavo</a></div>
      : <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl bg-[#102b46] p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-white/60">Order {portal.order.orderNumber}</p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><h1 className="text-3xl font-black tracking-[-.04em] sm:text-4xl">{pretty(status || "processing")}</h1><p className="mt-2 text-sm text-white/65">Placed {portal.order.createdAt ? new Date(portal.order.createdAt).toLocaleString() : "—"}</p></div>
            <div className="sm:text-right"><p className="text-xs text-white/60">Order total</p><p className="mt-1 text-2xl font-black">{money(portal.order.total, portal.order.currency)}</p></div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-4">
            {[
              { label: "Order received", done: true },
              { label: "Supplier / fulfillment", done: ["processing","shipped","in_transit","delivered"].includes(status) },
              { label: "In transit", done: ["in_transit","delivered"].includes(status) },
              { label: "Delivered", done: status === "delivered" },
            ].map(step=><div key={step.label} className={"rounded-xl border p-3 " + (step.done ? "border-white/20 bg-white/10" : "border-white/10 bg-white/[.03]")}><div className="flex items-center gap-2"><span className={"h-2 w-2 rounded-full " + (step.done ? "bg-emerald-300" : "bg-white/30")}/><span className="text-[11px] font-bold">{step.label}</span></div></div>)}
          </div>
        </section>
        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-5">
            <article className="rounded-2xl border border-[#e0e5eb] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f0f3f6]">{portal.order.product?.imageUrl ? <img src={portal.order.product.imageUrl} alt="" className="h-full w-full object-cover"/> : <PackageCheck className="h-7 w-7 text-[#7a8b9e]"/>}</div>
                <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#748398]">Purchased item</p><h2 className="mt-2 text-lg font-black">{portal.order.product?.title ?? "Store order"}</h2><p className="mt-1 text-sm text-[#68788b]">Quantity: {portal.order.quantity}</p></div>
              </div>
            </article>
            <article className="rounded-2xl border border-[#e0e5eb] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-[#eef4f8] p-2 text-[#244b70]"><Truck className="h-5 w-5"/></div><div><h2 className="text-lg font-black">Shipment details</h2><p className="text-xs text-[#748398]">Updates reflect information recorded by the store.</p></div></div>
              {portal.order.tracking.number ? <div className="mt-5 rounded-xl border border-[#e0e5eb] p-4"><p className="text-xs font-bold text-[#748398]">Tracking number</p><p className="mt-1 break-all font-mono text-sm font-black">{portal.order.tracking.number}</p>{portal.order.tracking.carrier && <p className="mt-1 text-xs text-[#68788b]">{portal.order.tracking.carrier}</p>}{portal.order.tracking.url && <a href={portal.order.tracking.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex items-center gap-2 text-sm font-bold" style={{ color: accent }}>Open carrier tracking <ExternalLink className="h-4 w-4"/></a>}</div>
              : <div className="mt-5 rounded-xl border border-dashed border-[#d7dce3] p-5"><p className="text-sm font-bold">Tracking is not available yet</p><p className="mt-1 text-xs leading-5 text-[#68788b]">The store has not recorded a tracking number or carrier link for this order.</p></div>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#f6f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#748398]">Shipped</p><p className="mt-1 text-sm font-bold">{portal.order.tracking.shippedAt ? new Date(portal.order.tracking.shippedAt).toLocaleString() : "Not recorded"}</p></div><div className="rounded-xl bg-[#f6f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#748398]">Delivered</p><p className="mt-1 text-sm font-bold">{portal.order.tracking.deliveredAt ? new Date(portal.order.tracking.deliveredAt).toLocaleString() : "Not recorded"}</p></div></div>
            </article>
          </div>
          <div className="space-y-5">
            <article className="rounded-2xl border border-[#e0e5eb] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-[#f4f1e8] p-2" style={{ color: accent }}><RotateCcw className="h-5 w-5"/></div><div><h2 className="text-lg font-black">Returns and exchanges</h2><p className="text-xs text-[#748398]">Requests go to the store for review.</p></div></div>
              {portal.returns.enabled ? <p className="mt-4 text-xs leading-5 text-[#68788b]">The store’s configured return window is {portal.returns.windowDays} days after delivery. {portal.returns.daysSinceDelivery === null ? "The window starts after delivery is recorded." : portal.returns.windowOpen ? portal.returns.daysSinceDelivery + " day(s) have elapsed since delivery." : "The return window has closed."}</p> : <p className="mt-4 text-xs leading-5 text-[#68788b]">This store is not currently accepting return or exchange requests.</p>}
              {message && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><span>{message}</span></div>}
              {portal.returns.windowOpen && portal.returns.remainingQuantity > 0 ? <form onSubmit={submitReturn} className="mt-5 space-y-3">
                <label className={labelClass}>Request type<select className={inputClass} value={requestType} onChange={e=>setField("requestType",e.target.value)}><option value="return">Return item</option><option value="exchange">Exchange item</option></select></label>
                <label className={labelClass}>Reason<select className={inputClass} value={reason} onChange={e=>setField("reason",e.target.value)}>{REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
                <label className={labelClass}>Quantity to return/exchange<input className={inputClass} type="number" min="1" max={portal.returns.remainingQuantity} value={quantity} onChange={e=>setField("quantity",e.target.value)} required/><span className="mt-1 block font-normal text-[#748398]">Up to {portal.returns.remainingQuantity} item(s) remain eligible on this order.</span></label>
                <label className={labelClass}>Additional details (optional)<textarea className="mt-1 min-h-24 w-full rounded-xl border border-[#d7dce3] bg-white p-3 text-sm text-[#14263a] outline-none focus:border-[#3d668b]" value={customerMessage} maxLength={2000} onChange={e=>setField("customerMessage",e.target.value)} placeholder="Tell the store what happened."/></label>
                {submitError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800" role="alert">{submitError}</p>}
                <button type="submit" disabled={submitting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white disabled:opacity-50" style={{ backgroundColor: accent }}>{submitting ? "Sending request…" : "Submit " + requestType + " request"}</button>
                <p className="text-[10px] leading-5 text-[#748398]">Submitting does not create a refund or contact the supplier. The store must review it.</p>
              </form> : <div className="mt-5 rounded-xl bg-[#f6f8fa] p-4"><p className="text-sm font-bold">{portal.returns.remainingQuantity === 0 ? "All purchased quantity is already in active or completed return requests." : portal.returns.windowOpen ? "No returnable quantity remains." : "Return requests are not available right now."}</p><p className="mt-1 text-xs leading-5 text-[#68788b]">You can still view previous request status below.</p></div>}
              {submitError && (!portal.returns.windowOpen || portal.returns.remainingQuantity === 0) && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800" role="alert">{submitError}</p>}
            </article>
            <article className="rounded-2xl border border-[#e0e5eb] bg-white p-5 sm:p-6"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-[#748398]"/><h2 className="text-lg font-black">Request history</h2></div>
              {portal.returns.requests.length ? <div className="mt-4 space-y-3">{portal.returns.requests.map(item=><div key={item.id} className="rounded-xl border border-[#e0e5eb] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{pretty(item.type)} · {item.quantity} item(s)</p><p className="mt-1 text-xs text-[#68788b]">{REASON_LABEL[item.reason] ?? pretty(item.reason)}</p></div><span className="rounded-full bg-[#eef2f6] px-2.5 py-1 text-[10px] font-black uppercase">{pretty(item.status)}</span></div>{item.customerMessage && <p className="mt-2 text-xs leading-5 text-[#68788b]">{item.customerMessage}</p>}<p className="mt-2 text-[10px] text-[#748398]">Requested {new Date(item.createdAt).toLocaleString()}</p></div>)}</div> : <p className="mt-4 text-sm text-[#68788b]">There are no return or exchange requests for this order yet.</p>}
            </article>
          </div>
        </section>
        <p className="mx-auto flex max-w-3xl items-start gap-2 px-2 text-center text-[10px] leading-5 text-[#748398]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>Private order link. Your email, phone and delivery address are not displayed. Keep this link private. {portal.privacy}</p>
      </div>}
    </div>
  </main>;
}
