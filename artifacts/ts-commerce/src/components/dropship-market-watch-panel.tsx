import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";

type ProductReference = { id: number; title: string };
type Watch = {
  id: string;
  source_kind: "competitor" | "ad_spy";
  source_url: string;
  interval_minutes: number;
  status: "active" | "paused" | "failed";
  last_observation_id: string | null;
  last_observed_title: string | null;
  last_observed_currency: string | null;
  last_observed_price_minor: string | number | null;
  last_observed_availability: string | null;
  last_checked_at: string | null;
  next_capture_at: string;
  last_error: string | null;
  consecutive_failures: number;
  capture_count: string | number;
  created_at: string;
  supplier_product_id: number | null;
  linked_product_title: string | null;
};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return {};
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Market-watch request failed.");
  return data;
}

function money(minor: string | number | null, currency: string | null): string {
  if (minor == null || !currency) return "Price not available";
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const amount = Number(minor) / (10 ** digits);
    if (!Number.isFinite(amount)) return "Price not available";
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${currency} ${String(minor)} minor units`;
  }
}

function date(value: string | null | undefined): string {
  if (!value) return "Not captured yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toLocaleString();
}

export function DropshipMarketWatchPanel({ products }: { products: ProductReference[] }) {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceKind, setSourceKind] = useState<"competitor" | "ad_spy">("competitor");
  const [productId, setProductId] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("360");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [maxWatches, setMaxWatches] = useState(30);

  const load = useCallback(async () => {
    try {
      const data = await request("/api/merchant/dropship/market-watches");
      setWatches(Array.isArray(data.watches) ? data.watches as Watch[] : []);
      if (typeof data.maxWatches === "number") setMaxWatches(data.maxWatches);
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Market watches could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function createWatch(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await request("/api/merchant/dropship/market-watches", "POST", {
        sourceUrl: sourceUrl.trim(),
        sourceKind,
        supplierProductId: productId ? Number(productId) : null,
        intervalMinutes: Number(intervalMinutes),
        idempotencyKey: `market-watch-create:${crypto.randomUUID()}`,
      });
      setSourceUrl("");
      setProductId("");
      setNotice({ error: false, text: "Monitoring is active. Lunavo saved the first page observation; the next capture is scheduled using your selected interval." });
      await load();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Market watch could not be created." });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(watch: Watch, status: "active" | "paused") {
    setBusyId(watch.id);
    setNotice(null);
    try {
      await request(`/api/merchant/dropship/market-watches/${watch.id}`, "PATCH", { status });
      setNotice({ error: false, text: status === "paused" ? "Monitoring paused." : "Monitoring resumed. A new capture is due shortly." });
      await load();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Market watch could not be updated." });
    } finally {
      setBusyId("");
    }
  }

  async function removeWatch(watch: Watch) {
    setBusyId(watch.id);
    setNotice(null);
    try {
      await request(`/api/merchant/dropship/market-watches/${watch.id}`, "DELETE");
      setNotice({ error: false, text: "Market watch removed. Previous research observations remain in the evidence history." });
      await load();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Market watch could not be removed." });
    } finally {
      setBusyId("");
    }
  }

  return <section className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Scheduled market research</p>
        <h2 className="mt-1 text-xl font-black">Competitor & ad-spy watches</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">Track public product pages at a controlled interval. Each capture is saved with source provenance and feeds the market-research evidence history. Page prices and availability are not checkout-verified.</p>
      </div>
      <button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
      </button>
    </div>

    <form onSubmit={createWatch} className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(130px,.7fr)_minmax(180px,1fr)_minmax(130px,.7fr)_auto]">
      <label className="grid gap-1 text-xs font-bold">Public product URL
        <input required type="url" maxLength={2048} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://example.com/products/item" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-accent/30" />
      </label>
      <label className="grid gap-1 text-xs font-bold">Observation type
        <select value={sourceKind} onChange={event => setSourceKind(event.target.value as "competitor" | "ad_spy")} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
          <option value="competitor">Competitor</option>
          <option value="ad_spy">Ad / product research</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold">Link to your product
        <select value={productId} onChange={event => setProductId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">Unlinked observation</option>
          {products.map(product => <option key={product.id} value={String(product.id)}>{(product.title || `Product #${product.id}`).slice(0, 100)}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold">Capture interval
        <select value={intervalMinutes} onChange={event => setIntervalMinutes(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
          <option value="60">Every hour</option>
          <option value="180">Every 3 hours</option>
          <option value="360">Every 6 hours</option>
          <option value="720">Every 12 hours</option>
          <option value="1440">Every 24 hours</option>
        </select>
      </label>
      <button type="submit" disabled={saving || loading || !sourceUrl.trim() || watches.length >= maxWatches} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#0c2747] px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">
        <Plus className="h-4 w-4" /> {saving ? "Checking page…" : "Add watch"}
      </button>
    </form>

    {watches.length >= maxWatches && <p className="mt-2 text-xs text-muted-foreground">Workspace limit reached ({maxWatches}). Remove a watch before adding another.</p>}
    {notice && <p role={notice.error ? "alert" : "status"} className={`mt-3 rounded-xl px-3 py-3 text-xs leading-5 ${notice.error ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{notice.text}</p>}

    <div className="mt-5 space-y-3">
      {loading ? <p className="text-xs text-muted-foreground">Loading saved watches…</p>
        : watches.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center">
          <Activity className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-extrabold">No scheduled watches yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add a public product page above. Lunavo will safely capture it once before scheduling future checks.</p>
        </div>
        : watches.map(watch => <article key={watch.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-black uppercase">{watch.status.replaceAll("_", " ")}</span>
                <span className="text-[10px] font-bold text-muted-foreground">{watch.source_kind === "competitor" ? "Competitor watch" : "Ad / product watch"} · every {watch.interval_minutes} min</span>
              </div>
              <p className="mt-2 break-all text-xs font-extrabold">{watch.last_observed_title || watch.linked_product_title || "Public product page"}</p>
              <a href={watch.source_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[10px] text-accent underline underline-offset-2">{watch.source_url}</a>
              <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-3">
                <div><span className="text-muted-foreground">Observed price</span><p className="mt-1 font-black">{money(watch.last_observed_price_minor, watch.last_observed_currency)}</p></div>
                <div><span className="text-muted-foreground">Page availability</span><p className="mt-1 font-black">{watch.last_observed_availability || "Not exposed"}</p></div>
                <div><span className="text-muted-foreground">Last capture attempt</span><p className="mt-1 font-black">{date(watch.last_checked_at)}</p></div>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{watch.status === "active" ? `Next check: ${date(watch.next_capture_at)} · ${Number(watch.capture_count) || 0} successful captures` : watch.status === "paused" ? "Paused by merchant." : "Paused after repeated capture failures. Resume to retry."}</p>
              {watch.last_error && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-900">{watch.last_error}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {watch.status === "active"
                ? <button type="button" disabled={busyId === watch.id} onClick={() => void setStatus(watch, "paused")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-[10px] font-black disabled:opacity-50"><Pause className="h-3 w-3" /> Pause</button>
                : <button type="button" disabled={busyId === watch.id} onClick={() => void setStatus(watch, "active")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-[10px] font-black disabled:opacity-50"><Play className="h-3 w-3" /> Resume</button>}
              <button type="button" disabled={busyId === watch.id} onClick={() => void removeWatch(watch)} aria-label="Remove market watch" className="inline-flex items-center justify-center rounded-lg border border-border px-2.5 py-2 text-[10px] font-black text-destructive disabled:opacity-50"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        </article>)}
    </div>

    <p className="mt-4 text-[10px] leading-4 text-muted-foreground">Safety boundary: saved observations are public-page evidence, not verified checkout prices. Scheduled research does not change your prices, stock, orders, payments, or external ad accounts. A watch stops after repeated failures and must be resumed manually.</p>
  </section>;
}
