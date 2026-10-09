import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArrowDownUp, Link2, Plus, RefreshCw, ShieldCheck } from "lucide-react";

type SyncJob = {
  id: string;
  connectionId: string;
  direction: string;
  resource: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  metrics?: Record<string, unknown>;
  createdAt?: string;
};

type Connection = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  storeUrl?: string | null;
  credentialConfigured: boolean;
  webhookConfigured: boolean;
  sync: Record<string, boolean>;
  lastError?: string | null;
};

const providers = ["shopify","woocommerce","etsy","amazon","tiktok_shop","wix","squarespace","custom"];

export default function Channels() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [adapterGatewayConfigured, setAdapterGatewayConfigured] = useState(false);
  const [provider, setProvider] = useState("shopify");
  const [name, setName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [response, jobsResponse] = await Promise.all([
      fetch("/api/merchant/channels", { credentials: "same-origin", headers: { Accept: "application/json" } }),
      fetch("/api/merchant/channels/jobs", { credentials: "same-origin", headers: { Accept: "application/json" } }),
    ]);
    const [data, jobsData] = await Promise.all([
      response.json().catch(() => ({})),
      jobsResponse.json().catch(() => ({})),
    ]);
    if (!response.ok) throw new Error(data.error || "Could not load channels");
    if (!jobsResponse.ok) throw new Error(jobsData.error || "Could not load sync history");
    setAdapterGatewayConfigured(data.adapterGatewayConfigured === true);
    setConnections(data.connections ?? []);
    setSyncJobs(jobsData.jobs ?? []);
  };

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load channels")); }, []);

  const connect = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/merchant/channels", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ provider, displayName: name, storeUrl: storeUrl || null, accessToken: accessToken || undefined, refreshToken: refreshToken || undefined, webhookSecret: webhookSecret || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create channel");
      setName("");
      setStoreUrl("");
      setAccessToken("");
      setRefreshToken("");
      setWebhookSecret("");
      setMessage("Draft saved. Secrets are encrypted server-side. Verify the connection before requesting any sync.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create channel");
    } finally {
      setBusy(false);
    }
  };

  const sync = async (connectionId: string, resource: string) => {
    const response = await fetch("/api/merchant/channels/" + encodeURIComponent(connectionId) + "/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ direction: "pull", resource }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Sync job queued for " + resource + ". The worker will report provider evidence and the resulting job state." : (data.error || "Could not queue sync"));
    if (response.ok) await load();
  };

  const verifyConnection = async (connectionId: string) => {
    setConnectingId(connectionId);
    setMessage("");
    try {
      const response = await fetch("/api/merchant/channels/" + encodeURIComponent(connectionId) + "/connect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The channel could not be verified");
      setMessage("Provider connection verified. Bootstrap jobs queued: " + (data.bootstrapQueued ?? []).join(", ") + ".");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The channel could not be verified");
    } finally {
      setConnectingId(null);
    }
  };

  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[24px] border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">Channel Hub</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-[-.05em]">One catalog, many sales channels.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Lunavo remains the operating system and source of truth. External channels are adapters with isolated credentials, replay-safe sync jobs and explicit provider boundaries.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-bold"><ShieldCheck className="h-4 w-4 text-accent" /> No channel becomes financial authority</div>
        </div>
      </section>

      {!adapterGatewayConfigured && <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6">
        <strong>Self-hosted adapter gateway is not configured.</strong> Channel credentials can be saved encrypted, but connection checks will not pass and sync jobs remain queued. Configure <code>LUNAVO_CHANNEL_GATEWAY_URL</code> and <code>LUNAVO_CHANNEL_GATEWAY_TOKEN</code> on the private deployment. The gateway must be a local/private endpoint; public adapter endpoints are rejected.
      </section>}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-accent" /><h2 className="font-black">Add a channel connection</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
            {providers.map(item => <option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Channel name" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
          <input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://store.example.com" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
          <input type="password" autoComplete="new-password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Access token (encrypted)" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
          <input type="password" autoComplete="new-password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="Refresh token (optional)" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
          <input type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Webhook secret (optional)" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
          <button onClick={() => void connect()} disabled={busy || !name.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50"><Link2 className="h-4 w-4" /> {busy ? "Saving…" : "Save draft"}</button>
        </div>
        {message && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{message}</p>}
      </section>

      <section className="grid gap-4">
        {connections.map(connection => <div key={connection.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{connection.provider}</p>
              <h2 className="mt-1 text-lg font-black">{connection.displayName}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{connection.storeUrl || "No storefront URL supplied"} · {connection.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void verifyConnection(connection.id)} disabled={connectingId === connection.id || connection.status === "revoked" || connection.status === "paused"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50"><ShieldCheck className="h-3 w-3" /> {connectingId === connection.id ? "Verifying…" : "Verify & connect"}</button>
              {["products","inventory","orders","fulfillment"].map(resource => <button key={resource} disabled={!["connected","degraded"].includes(connection.status)} onClick={() => void sync(connection.id, resource)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-40"><ArrowDownUp className="h-3 w-3" /> {resource}</button>)}
              <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black"><RefreshCw className="h-3 w-3" /> Refresh</button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <p className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold">Credentials: {connection.credentialConfigured ? "encrypted" : "not configured"}</p>
            <p className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold">Webhook: {connection.webhookConfigured ? "encrypted" : "not configured"}</p>
            <p className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold">Sync runs only after verification and requires a configured self-hosted adapter. Provider credentials are never shown again.</p>
          {connection.lastError && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">Last adapter error: {connection.lastError}</p>}
          {syncJobs.filter(job => job.connectionId === connection.id).slice(0, 3).map(job => <div key={job.id} className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold">{job.direction} · {job.resource} · {job.status} · attempt {job.attempts}</span>
            <span className="text-muted-foreground">{job.completedAt ? new Date(job.completedAt).toLocaleString() : job.lastError || "Queued/processing"}</span>
          </div>)}
          </div>
        </div>)}
        {!connections.length && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No channels connected yet.</div>}
      </section>
    </div>
  </AppShell>;
}
