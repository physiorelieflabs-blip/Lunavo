import { useEffect, useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge, Button } from "@/components/primitives";

type ProductChoice = {
  id: number;
  title: string;
  currency?: string;
  price?: number | null;
  salePrice?: number | null;
  availability?: string | null;
};

type SupplierAlternative = {
  id: string;
  primary_product_id: number;
  alternative_product_id: number;
  priority: number;
  enabled: boolean;
  auto_fallback: boolean;
  same_currency_required: boolean;
  min_margin_bps: number;
  min_supplier_quantity: number;
  max_shipping_days: number;
  notes: string | null;
  alternative_title?: string;
  alternative_currency?: string;
  alternative_price?: string | null;
  alternative_sale_price?: string | null;
  alternative_availability?: string | null;
};

export function SupplierRoutingPanel({ current, products }: { current: ProductChoice; products: ProductChoice[] }) {
  const [alternatives, setAlternatives] = useState<SupplierAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [candidateId, setCandidateId] = useState<string>("");
  const [priority, setPriority] = useState("100");
  const [minMargin, setMinMargin] = useState("15");
  const [minQuantity, setMinQuantity] = useState("0");
  const [maxDays, setMaxDays] = useState("30");
  const [autoFallback, setAutoFallback] = useState(false);
  const [message, setMessage] = useState("");

  const candidates = useMemo(() => products.filter((item) => item.id !== current.id), [products, current.id]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await customFetch<{ alternatives: SupplierAlternative[] }>(
        "/api/merchant/dropshipping/routing/" + current.id,
        { responseType: "json" },
      );
      setAlternatives(result.alternatives ?? []);
    } catch {
      setAlternatives([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [current.id]);

  const add = async () => {
    const altId = Number(candidateId);
    const priorityValue = Number(priority);
    const marginPercent = Number(minMargin);
    const minimumQuantity = Number(minQuantity);
    const maximumDays = Number(maxDays);
    if (!Number.isInteger(altId) || altId <= 0) { setMessage("Choose an alternate supplier product."); return; }
    if (!Number.isInteger(priorityValue) || priorityValue < 1) { setMessage("Priority must be a positive whole number."); return; }
    if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 100) { setMessage("Minimum fallback margin must be between 0% and 100%."); return; }
    if (!Number.isInteger(minimumQuantity) || minimumQuantity < 0) { setMessage("Minimum supplier quantity must be a whole number of 0 or more."); return; }
    if (!Number.isInteger(maximumDays) || maximumDays < 1 || maximumDays > 365) { setMessage("Maximum shipping time must be between 1 and 365 days."); return; }
    setBusy(true); setMessage("");
    try {
      await customFetch("/api/merchant/dropshipping/routing/" + current.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alternativeProductId: altId,
          priority: priorityValue,
          enabled: true,
          autoFallback,
          sameCurrencyRequired: true,
          minMarginBps: Math.round(marginPercent * 100),
          minSupplierQuantity: minimumQuantity,
          maxShippingDays: maximumDays,
        }),
      });
      setCandidateId("");
      setMessage("Supplier fallback mapping saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Supplier fallback mapping could not be saved.");
    } finally { setBusy(false); }
  };

  const remove = async (mappingId: string) => {
    setBusy(true); setMessage("");
    try {
      await customFetch("/api/merchant/dropshipping/routing/" + mappingId, { method: "DELETE" });
      setMessage("Fallback mapping removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fallback mapping could not be removed.");
    } finally { setBusy(false); }
  };

  return <div className="mt-4 rounded-xl border border-[#536174] bg-[#1b2a39] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-[#d6aa46]"><Link2 className="h-3.5 w-3.5" /> Supplier routing</p>
      <p className="mt-1 text-xs leading-5 text-[#b8c2cc]">Keep an alternate source ready when the primary supplier goes out of stock or falls below the configured margin. Automatic fallback is still currency-safe and approval-gated at checkout.</p></div>
      <Badge tone={alternatives.some((item) => item.enabled && item.auto_fallback) ? "success" : "neutral"}>{alternatives.filter((item) => item.enabled).length} mapped</Badge>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_110px_110px_110px_110px_auto]">
      <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} className="h-10 rounded-lg border border-[#536174] bg-[#263644] px-3 text-xs font-bold text-[#f8f3e8]">
        <option value="">Add alternate product…</option>
        {candidates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="1" max="100000" aria-label="Fallback priority" className="h-10 rounded-lg border border-[#536174] bg-[#263644] px-3 text-xs font-bold text-[#f8f3e8]" placeholder="Priority" />
      <input value={minMargin} onChange={(event) => setMinMargin(event.target.value)} type="number" min="0" max="100" step="0.01" aria-label="Minimum fallback margin" className="h-10 rounded-lg border border-[#536174] bg-[#263644] px-3 text-xs font-bold text-[#f8f3e8]" placeholder="Margin %" />
      <input value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} type="number" min="0" step="1" aria-label="Minimum supplier quantity" className="h-10 rounded-lg border border-[#536174] bg-[#263644] px-3 text-xs font-bold text-[#f8f3e8]" placeholder="Min qty" />
      <input value={maxDays} onChange={(event) => setMaxDays(event.target.value)} type="number" min="1" max="365" step="1" aria-label="Maximum shipping days" className="h-10 rounded-lg border border-[#536174] bg-[#263644] px-3 text-xs font-bold text-[#f8f3e8]" placeholder="Max days" />
      <Button className="min-h-10 px-3 text-xs" onClick={() => void add()} disabled={busy || !candidateId}><Plus className="h-3.5 w-3.5" />Map source</Button>
    </div>
    <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#d8e1e3]"><input type="checkbox" checked={autoFallback} onChange={(event) => setAutoFallback(event.target.checked)} />Allow this new mapping to be considered for automatic fallback</label>
    {message && <p className="mt-3 text-xs text-[#d8e1e3]" aria-live="polite">{message}</p>}
    {loading ? <p className="mt-4 text-xs text-[#8fa1b2]">Loading fallback mappings…</p> : alternatives.length ? <div className="mt-4 space-y-2">
      {alternatives.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#46566a] bg-[#263644] p-3">
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-[#f8f3e8]">{item.alternative_title ?? "Alternate supplier product"}</p><p className="mt-1 text-[11px] text-[#8fa1b2]">Priority {item.priority} · margin ≥ {(item.min_margin_bps / 100).toFixed(2)}% · min qty {item.min_supplier_quantity} · ≤ {item.max_shipping_days} shipping days · {item.alternative_availability ?? "availability unknown"}</p></div>
        <Badge tone={item.auto_fallback && item.enabled ? "success" : "neutral"}>{item.auto_fallback && item.enabled ? "Auto fallback" : "Manual backup"}</Badge>
        <button type="button" onClick={() => void remove(item.id)} disabled={busy} aria-label="Remove supplier mapping" className="grid h-8 w-8 place-items-center rounded-lg border border-[#536174] text-[#c7d0d8] hover:border-[#d6aa46] hover:text-[#d6aa46]"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>)}
    </div> : <p className="mt-4 text-xs text-[#8fa1b2]">No alternate source mapped yet.</p>}
  </div>;
}
