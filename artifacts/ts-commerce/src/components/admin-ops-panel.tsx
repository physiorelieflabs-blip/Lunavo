import { useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge, Button, EmptyState, LoadingState, SectionHeading } from "@/components/primitives";

type Health = {
  checkedAt: string;
  database: { reachable: boolean };
  schema: { complete: boolean };
  migrations: { applied: number };
  payments: { provider: string; configured: boolean; mode: string; checkoutAvailable: boolean };
  ai: { providerConfigured: boolean; deepSeekConfigured: boolean; geminiConfigured: boolean; localLlmConfigured: boolean };
  reconciliation: { openOrInvestigating: number };
  workers: { socialPublishing: { queuedOrProcessing: number; failed: number }; adminAiStore: { queuedOrProcessing: number; failed: number }; domainEvents: { pendingOrProcessing: number; failed: number } };
  notes: string[];
};

const statusTone = (ok: boolean) => ok ? "success" : "danger";

export function AdminOpsPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [reference, setReference] = useState("");
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState("");

  const loadHealth = async () => {
    setLoading(true);
    try { setHealth(await customFetch<Health>("/api/admin/system/health", { responseType: "json" })); }
    catch { setHealth(null); }
    finally { setLoading(false); }
  };

  const runTrace = async () => {
    const value = reference.trim();
    if (!value) return;
    setTraceError(""); setTraceLoading(true);
    try { setTrace(await customFetch<Record<string, unknown>>("/api/admin/financial-trace?reference=" + encodeURIComponent(value), { responseType: "json" })); }
    catch (error) { setTraceError(error instanceof Error ? error.message : "Financial trace failed"); setTrace(null); }
    finally { setTraceLoading(false); }
  };

  return <div className="mt-8 grid gap-6 lg:grid-cols-2">
    <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
      <SectionHeading eyebrow="Live operations" title="System health" description="Real dependency and queue state. No green status is invented." action={<Button type="button" variant="secondary" onClick={() => void loadHealth()} disabled={loading}>{loading ? "Checking…" : <><RefreshCw className="h-4 w-4" />Refresh</>}</Button>} />
      {!health && !loading ? <EmptyState title="Health not loaded" description="Run a check to inspect database, schema, providers, reconciliation and worker queues." /> : loading ? <div className="mt-5"><LoadingState label="Checking system health" /></div> : <div className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between"><span>Database</span><Badge tone={statusTone(health!.database.reachable)}>{health!.database.reachable ? "reachable" : "down"}</Badge></div>
        <div className="flex items-center justify-between"><span>Schema</span><Badge tone={statusTone(health!.schema.complete)}>{health!.schema.complete ? "complete" : "incomplete"}</Badge></div>
        <div className="flex items-center justify-between"><span>Migrations applied</span><strong>{health!.migrations.applied}</strong></div>
        <div className="flex items-center justify-between"><span>Flutterwave</span><Badge tone={statusTone(health!.payments.checkoutAvailable)}>{health!.payments.checkoutAvailable ? `${health!.payments.mode} configured` : "not configured"}</Badge></div>
        <div className="flex items-center justify-between"><span>AI reasoning</span><Badge tone={statusTone(health!.ai.providerConfigured)}>{health!.ai.providerConfigured ? "configured" : "unavailable"}</Badge></div>
        <div className="flex items-center justify-between"><span>Reconciliation exceptions</span><strong className={health!.reconciliation.openOrInvestigating ? "text-[#9a3b35]" : ""}>{health!.reconciliation.openOrInvestigating}</strong></div>
        <div className="rounded-lg border p-3"><b>Worker queues</b><div className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><span>Social: {health!.workers.socialPublishing.queuedOrProcessing} active / {health!.workers.socialPublishing.failed} failed</span><span>AI stores: {health!.workers.adminAiStore.queuedOrProcessing} active / {health!.workers.adminAiStore.failed} failed</span><span>Events: {health!.workers.domainEvents.pendingOrProcessing} active / {health!.workers.domainEvents.failed} failed</span></div></div>
      </div>}
    </section>

    <section className="rounded-xl border border-[#bfd6dc] bg-[#eef7f8] p-6">
      <SectionHeading eyebrow="Financial investigator" title="Trace a payment" description="Follow a reference through payment session, provider evidence, ledger, dashboard projection and reconciliation without mutating history." action={<ShieldCheck className="h-5 w-5 text-[#315e6c]" />} />
      <div className="mt-4 flex gap-2"><input value={reference} onChange={(e) => setReference(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runTrace(); }} className="min-w-0 flex-1 rounded-lg border border-[#b9ccd2] bg-white px-3 py-2.5 text-sm" placeholder="Provider transaction, payment ref, internal ref" maxLength={200} /><Button type="button" onClick={() => void runTrace()} disabled={!reference.trim() || traceLoading}><Search className="h-4 w-4" />Trace</Button></div>
      {traceError && <p className="mt-3 text-xs font-bold text-[#9a3b35]">{traceError}</p>}
      {traceLoading && <div className="mt-4"><LoadingState label="Tracing financial records" /></div>}
      {trace && <div className="mt-5 space-y-3 text-xs">{Object.entries((trace.trace as Record<string, unknown>) ?? {}).map(([name, rows]) => { const list = Array.isArray(rows) ? rows : []; return <div key={name} className="rounded-lg border bg-white p-3"><div className="flex justify-between"><b>{name}</b><span>{list.length} records</span></div>{list.slice(0, 3).map((row, index) => <pre key={index} className="mt-2 overflow-auto rounded bg-[#f7f4ed] p-2 text-[10px]">{JSON.stringify(row, null, 2)}</pre>)}</div>; })}</div>}
    </section>
  </div>;
}
