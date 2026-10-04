import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageSearch,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  SectionHeading,
} from "@/components/primitives";
import { money } from "@/lib/format";

type Decision = "SCALE" | "TEST" | "FIX" | "PAUSE";
type Risk = "low" | "medium" | "high" | "critical";

type Product = {
  id: number;
  title: string;
  supplierDomain: string;
  sourceUrl: string;
  currency: string;
  sellingPrice: number;
  supplierCost: number | null;
  shippingCost: number | null;
  availability: string | null;
  availabilityQuantity: number | null;
  economics: {
    decision: Decision;
    risk: Risk;
    revenueMinor: number;
    landedCostMinor: number | null;
    contributionBeforeAdsMinor: number | null;
    marginBpsBeforeAds: number | null;
    breakEvenCpaMinor: number | null;
    breakEvenRoasX100: number | null;
    reasons: string[];
  };
};

type Supplier = {
  domain: string;
  name: string;
  observations: number;
  productsObserved: number;
  fulfilledOrders: number;
  deliveredOrders: number;
  qualityScore: number | null;
  trackingScore: number | null;
  refundRateBps: number | null;
  etaMaxDays: number | null;
  passport: { score: number; confidence: string };
};

type SupplierOption = {
  productId: number;
  productTitle: string;
  supplierDomain: string;
  supplierName: string;
  supplierCost: number | null;
  shippingCost: number | null;
  currency: string;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  qualityScore: number | null;
  trackingScore: number | null;
  observedAt: string;
};

type Tracking = {
  orderId: number;
  orderNumber: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  lastRecordedAt: string;
  expectedDeliveryAt: string | null;
  lastRecordedEvent: string | null;
  gap: {
    state: "healthy" | "warning" | "critical" | "unknown";
    gapHours: number | null;
    message: string;
  };
};

type Alert = {
  id: string;
  severity: string;
  title: string;
  message: string;
};

type Overview = {
  generatedAt: string;
  sourceOfTruth: string;
  products: Product[];
  suppliers: Supplier[];
  supplierOptions: SupplierOption[];
  tracking: Tracking[];
  alerts: Alert[];
  metrics: {
    products: number;
    scale: number;
    test: number;
    fix: number;
    pause: number;
    openAlerts: number;
    criticalAlerts: number;
    trackingGaps: number;
  };
};

type ObservationState = {
  supplierProductId: string;
  supplierDomain: string;
  supplierName: string;
  sourceUrl: string;
  destinationCountry: string;
  shareWithSupplierNetwork: boolean;
  observedCost: string;
  shippingCost: string;
  currency: string;
  etaMinDays: string;
  etaMaxDays: string;
  qualityScore: string;
  trackingScore: string;
  defectRate: string;
  refundRate: string;
  notes: string;
};

const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a]";

function decisionTone(decision: Decision): "success" | "warning" | "danger" | "info" {
  if (decision === "SCALE") return "success";
  if (decision === "PAUSE") return "danger";
  if (decision === "FIX") return "warning";
  return "info";
}

function percent(bps: number | null): string {
  return bps == null ? "—" : (bps / 100).toFixed(1) + "%";
}

function riskTone(risk: Risk): "danger" | "warning" | "neutral" {
  return risk === "critical" || risk === "high" ? "danger" : risk === "medium" ? "warning" : "neutral";
}

function ProductCard({
  product,
  onTune,
  onAssess,
  busy,
}: {
  product: Product;
  onTune: () => void;
  onAssess: () => void;
  busy: boolean;
}) {
  const economics = product.economics;
  return (
    <article className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={decisionTone(economics.decision)}>{economics.decision}</Badge>
            <Badge tone={riskTone(economics.risk)}>{economics.risk} risk</Badge>
            <span className="text-xs text-[#8994a2]">{product.supplierDomain}</span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold">{product.title}</h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-black">{money(product.sellingPrice, product.currency)}</p>
          <p className="text-[11px] text-[#8994a2]">sell price</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Evidence score" value={economics.viabilityScore + "/100"} />
        <Metric
          label="Landed cost"
          value={
            economics.landedCostMinor == null
              ? "Unknown"
              : money(economics.landedCostMinor / 100, product.currency)
          }
        />
        <Metric
          label="Break-even CPA"
          value={
            economics.breakEvenCpaMinor == null
              ? "Unknown"
              : money(economics.breakEvenCpaMinor / 100, product.currency)
          }
        />
        <Metric label="Margin" value={percent(economics.marginBpsBeforeAds)} />
      </div>

      <div className="mt-4 rounded-xl border border-[#e0d9cc] bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[.08em] text-[#697687]">Why this decision</p>
        <div className="mt-2 space-y-1.5">
          {economics.reasons.map((reason, index) => (
            <p key={index} className="text-sm leading-6 text-[#536174]">
              • {reason}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onTune}>Tune economics</Button>
        <a
          href={product.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-extrabold"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Supplier source
        </a>
        <Button onClick={onAssess} disabled={busy}>
          {busy ? "Rechecking…" : "Recalculate guardrail"}
        </Button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f3efe7] p-3">
      <p className="text-[10px] uppercase tracking-[.08em] text-[#778290]">{label}</p>
      <p className="mt-1 font-mono text-lg font-black">{value}</p>
    </div>
  );
}

export default function DropshipIntelligence() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"command" | "suppliers" | "tracking">("command");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adSpend, setAdSpend] = useState("");
  const [targetMargin, setTargetMargin] = useState("20");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [negotiationSupplier, setNegotiationSupplier] = useState("");
  const [negotiationGoal, setNegotiationGoal] = useState(
    "Request a better landed cost and a clearer processing/tracking commitment.",
  );
  const [negotiationDraft, setNegotiationDraft] = useState("");
  const [negotiationBusy, setNegotiationBusy] = useState(false);
  const [defenseBusy, setDefenseBusy] = useState<number | null>(null);
  const [rescueBusy, setRescueBusy] = useState<number | null>(null);
  const [rescueDraft, setRescueDraft] = useState("");
  const [observation, setObservation] = useState<ObservationState>({
    supplierProductId: "",
    supplierDomain: "",
    supplierName: "",
    sourceUrl: "",
    destinationCountry: "",
    shareWithSupplierNetwork: false,
    observedCost: "",
    shippingCost: "",
    currency: "USD",
    etaMinDays: "",
    etaMaxDays: "",
    qualityScore: "",
    trackingScore: "",
    defectRate: "",
    refundRate: "",
    notes: "",
  });

  const selected = useMemo(
    () => data?.products.find((product) => product.id === selectedId) ?? null,
    [data, selectedId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dropship-intelligence/overview", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Dropship Intelligence could not be loaded"));
      setData(body as Overview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dropship Intelligence could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function assess(product: Product) {
    setBusyId(product.id);
    setNotice("");
    try {
      const response = await fetch("/api/dropship-intelligence/products/" + product.id + "/assess", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          adSpendPerOrder: adSpend === "" ? undefined : Number(adSpend),
          targetMarginBps: Math.round((Number(targetMargin) || 0) * 100),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Product assessment failed"));
      setNotice(product.title + " → " + body.economics.decision + " · score " + body.economics.viabilityScore + "/100");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Product assessment failed");
    } finally {
      setBusyId(null);
    }
  }

  async function saveObservation(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    try {
      const payload = {
        ...observation,
        supplierProductId: observation.supplierProductId
          ? Number(observation.supplierProductId)
          : undefined,
      };
      const response = await fetch("/api/dropship-intelligence/observations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Supplier observation could not be saved"));
      setNotice("Supplier evidence recorded. Future decisions will use it.");
      setObservation((current) => ({
        ...current,
        observedCost: "",
        shippingCost: "",
        etaMinDays: "",
        etaMaxDays: "",
        qualityScore: "",
        trackingScore: "",
        defectRate: "",
        refundRate: "",
        notes: "",
      }));
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Supplier observation could not be saved");
    }
  }

  async function draftNegotiation() {
    setNegotiationBusy(true);
    setNegotiationDraft("");
    setNotice("");
    try {
      const response = await fetch("/api/dropship-intelligence/suppliers/negotiate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ supplierDomain: negotiationSupplier, goal: negotiationGoal }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Negotiation draft could not be created"));
      setNegotiationDraft(String(body.draft || ""));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Negotiation draft could not be created");
    } finally {
      setNegotiationBusy(false);
    }
  }

  async function scanTracking() {
    setScanBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/dropship-intelligence/scan", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Tracking radar failed"));
      setNotice(
        "Tracking radar scanned " +
          String(body.scanned) +
          " handoffs and raised " +
          String(body.alerts?.length || 0) +
          " gap alerts.",
      );
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Tracking radar failed");
    } finally {
      setScanBusy(false);
    }
  }

  async function buildDefense(orderId: number) {
    setDefenseBusy(orderId);
    setNotice("");
    try {
      const response = await fetch(
        "/api/dropship-intelligence/orders/" + orderId + "/defense-pack",
        { credentials: "same-origin", headers: { Accept: "application/json" } },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Defense pack could not be created"));
      const serialized = JSON.stringify(body.defensePack, null, 2);
      if (navigator.clipboard) await navigator.clipboard.writeText(serialized);
      setNotice("Dispute Defense Pack prepared for order " + orderId + ". It contains only recorded Lunavo evidence.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Defense pack could not be created");
    } finally {
      setDefenseBusy(null);
    }
  }

  async function rescueCustomer(orderId: number) {
    setRescueBusy(orderId);
    setRescueDraft("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/dropship-intelligence/orders/" + orderId + "/customer-rescue",
        { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Customer rescue draft could not be created"));
      setRescueDraft(String(body.draft || ""));
      setNotice("Truthful customer rescue draft created. Review it before sending.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Customer rescue draft could not be created");
    } finally {
      setRescueBusy(null);
    }
  }

  async function resolveAlert(id: string) {
    const response = await fetch(
      "/api/dropship-intelligence/alerts/" + encodeURIComponent(id) + "/resolve",
      { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } },
    );
    if (response.ok) {
      await load();
    } else {
      setNotice("That alert could not be resolved.");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingState label="Building your Dropship Intelligence map" />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <ErrorState onRetry={() => void load()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1360px]">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a2772e]">
              Dropship Intelligence OS
            </p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-[-.07em] md:text-6xl">
              Stop guessing what to sell.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#697687] md:text-base">
              Recorded supplier, margin, fulfillment and tracking evidence becomes one operating signal:
              <strong> scale, test, fix, or pause.</strong> Missing data stays missing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              Evidence-backed
            </Badge>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => void scanTracking()} disabled={scanBusy}>
              <Route className="h-4 w-4" />
              {scanBusy ? "Scanning…" : "Run tracking radar"}
            </Button>
          </div>
        </header>

        {notice && (
          <div className="mt-6">
            <Notice
              tone={/could not|failed|invalid|error/i.test(notice) ? "danger" : "success"}
              title="Dropship Intelligence"
            >
              {notice}
            </Notice>
          </div>
        )}

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label="Products" value={String(data.metrics.products)} />
          <Metric label="Scale-ready" value={String(data.metrics.scale)} />
          <Metric label="Testing" value={String(data.metrics.test)} />
          <Metric label="Needs fix" value={String(data.metrics.fix)} />
          <Metric label="Pause" value={String(data.metrics.pause)} />
          <Metric label="Tracking gaps" value={String(data.metrics.trackingGaps)} />
        </section>

        <nav className="mt-8 flex flex-wrap gap-2 border-b border-[#ded8cd] pb-3">
          <TabButton active={tab === "command"} onClick={() => setTab("command")}>
            Profit command center
          </TabButton>
          <TabButton active={tab === "suppliers"} onClick={() => setTab("suppliers")}>
            Supplier passports
          </TabButton>
          <TabButton active={tab === "tracking"} onClick={() => setTab("tracking")}>
            Tracking + recovery
          </TabButton>
        </nav>

        {tab === "command" && (
          <CommandPanel
            data={data}
            selected={selected}
            adSpend={adSpend}
            targetMargin={targetMargin}
            setAdSpend={setAdSpend}
            setTargetMargin={setTargetMargin}
            setSelected={(product) => setSelectedId(product.id)}
            assess={assess}
            busyId={busyId}
          />
        )}

        {tab === "suppliers" && (
          <SupplierPanel
            data={data}
            observation={observation}
            setObservation={setObservation}
            saveObservation={saveObservation}
            negotiationSupplier={negotiationSupplier}
            setNegotiationSupplier={setNegotiationSupplier}
            negotiationGoal={negotiationGoal}
            setNegotiationGoal={setNegotiationGoal}
            negotiationDraft={negotiationDraft}
            negotiationBusy={negotiationBusy}
            draftNegotiation={draftNegotiation}
          />
        )}

        {tab === "tracking" && (
          <TrackingPanel
            data={data}
            defenseBusy={defenseBusy}
            rescueBusy={rescueBusy}
            rescueDraft={rescueDraft}
            buildDefense={buildDefense}
            rescueCustomer={rescueCustomer}
            resolveAlert={resolveAlert}
          />
        )}
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-4 py-2 text-xs font-extrabold " +
        (active ? "bg-[#182333] text-[#f8f3e8]" : "bg-[#f3efe7] text-[#697687]")
      }
    >
      {children}
    </button>
  );
}

function CommandPanel({
  data,
  selected,
  adSpend,
  targetMargin,
  setAdSpend,
  setTargetMargin,
  setSelected,
  assess,
  busyId,
}: {
  data: Overview;
  selected: Product | null;
  adSpend: string;
  targetMargin: string;
  setAdSpend: (value: string) => void;
  setTargetMargin: (value: string) => void;
  setSelected: (product: Product) => void;
  assess: (product: Product) => void;
  busyId: number | null;
}) {
  return (
    <div className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
      <section>
        <SectionHeading
          eyebrow="Smart Kill / Scale Gate"
          title="Every product gets a reason, not a vibe."
          description="Uses merchant selling price, supplier cost, shipping, platform fee, ad spend and recorded supplier evidence."
        />
        <div className="mt-5 space-y-4">
          {data.products.length === 0 ? (
            <EmptyState
              title="No active products yet"
              description="Import a real supplier product and price it to start the evidence engine."
            />
          ) : (
            data.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onTune={() => setSelected(product)}
                onAssess={() => void assess(product)}
                busy={busyId === product.id}
              />
            ))
          )}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-[#2c3948] bg-[#182333] p-6 text-[#f8f3e8]">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-5 w-5 text-[#d6aa46]" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#d6aa46]">
                Profit Shield
              </p>
              <h2 className="mt-1 text-xl font-extrabold">Protect the next ad dollar.</h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#b8c2cc]">
            Set expected ad cost and target contribution margin. Lunavo stores the resulting guardrail on the product.
          </p>
          <label className="mt-5 block text-sm font-bold">
            Ad spend / order
            <input
              value={adSpend}
              onChange={(event) => setAdSpend(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              className={inputClass + " border-[#536174] bg-[#263644] text-[#f8f3e8]"}
            />
          </label>
          <label className="mt-3 block text-sm font-bold">
            Target contribution margin %
            <input
              value={targetMargin}
              onChange={(event) => setTargetMargin(event.target.value)}
              type="number"
              min="0"
              max="90"
              step="1"
              className={inputClass + " border-[#536174] bg-[#263644] text-[#f8f3e8]"}
            />
          </label>
          {selected ? (
            <div className="mt-5 rounded-xl border border-[#536174] bg-[#202e3d] p-4">
              <p className="text-xs font-extrabold">{selected.title}</p>
              <p className="mt-1 text-xs text-[#b8c2cc]">
                Current: {selected.economics.decision}
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => void assess(selected)}
                disabled={busyId === selected.id}
              >
                {busyId === selected.id ? "Rechecking…" : "Apply guardrail"}
              </Button>
            </div>
          ) : (
            <p className="mt-5 text-xs text-[#8f9cab]">Choose “Tune economics” on a product.</p>
          )}
        </section>

        {selected && <CashflowMap product={selected} adSpend={adSpend} />}

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
          <SectionHeading
            eyebrow="Why this exists"
            title="Dropshipping without blind spots."
            description="Seller pain clusters around supplier reliability, delivery uncertainty, tracking gaps, margin uncertainty and scattered dispute evidence."
          />
          <div className="mt-5 space-y-3 text-sm text-[#536174]">
            <p className="flex gap-3">
              <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" />
              No positive-profit claim when landed cost is unknown.
            </p>
            <p className="flex gap-3">
              <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" />
              Supplier confidence increases with recorded evidence.
            </p>
            <p className="flex gap-3">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#a2772e]" />
              Silent tracking becomes a recovery signal.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function CashflowMap({ product, adSpend }: { product: Product; adSpend: string }) {
  const landed = product.economics.landedCostMinor;
  if (landed == null) {
    return (
      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
        <SectionHeading
          eyebrow="Cashflow Survival Map"
          title="Know the cash a winning product can consume."
          description="This is a transparent working-capital estimate from recorded landed cost and entered ad spend."
        />
        <p className="mt-4 rounded-xl bg-[#fff7df] p-4 text-sm leading-6 text-[#765817]">
          Record supplier cost and shipping first. Lunavo refuses to invent a capital requirement.
        </p>
      </section>
    );
  }

  const scenarios = [10, 50, 100];
  return (
    <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
      <SectionHeading
        eyebrow="Cashflow Survival Map"
        title="Know the cash a winning product can consume."
        description="Transparent working-capital exposure from recorded landed cost and entered ad spend. It is not a promise about settlement timing or available bank balance."
      />
      <div className="mt-4 space-y-3">
        {scenarios.map((orders) => {
          const capitalMinor = landed * orders + Math.round(Number(adSpend || 0) * 100) * orders;
          const revenueMinor = product.economics.revenueMinor * orders;
          const landedMinor = landed * orders;
          const adMinor = Math.round(Number(adSpend || 0) * 100) * orders;
          return (
            <div key={orders} className="rounded-xl border border-[#e0d9cc] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-extrabold">{orders} orders</p>
                <p className="font-mono text-sm font-black">
                  {money(revenueMinor / 100, product.currency)} revenue
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <Metric label="Supplier + shipping" value={money(landedMinor / 100, product.currency)} />
                <Metric label="Ad budget" value={money(adMinor / 100, product.currency)} />
              </div>
              <div className="mt-3 rounded-lg bg-[#f3efe7] p-3">
                <p className="text-[10px] uppercase tracking-[.08em] text-[#778290]">
                  Working-capital exposure
                </p>
                <p className="mt-1 font-mono text-lg font-black">
                  {money(capitalMinor / 100, product.currency)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SupplierPanel({
  data,
  observation,
  setObservation,
  saveObservation,
  negotiationSupplier,
  setNegotiationSupplier,
  negotiationGoal,
  setNegotiationGoal,
  negotiationDraft,
  negotiationBusy,
  draftNegotiation,
}: {
  data: Overview;
  observation: ObservationState;
  setObservation: React.Dispatch<React.SetStateAction<ObservationState>>;
  saveObservation: (event: FormEvent) => void;
  negotiationSupplier: string;
  setNegotiationSupplier: (value: string) => void;
  negotiationGoal: string;
  setNegotiationGoal: (value: string) => void;
  negotiationDraft: string;
  negotiationBusy: boolean;
  draftNegotiation: () => void;
}) {
  return (
    <div className="mt-7 grid gap-7">
      <section>
        <SectionHeading
          eyebrow="Supplier Passport"
          title="Know who deserves your scale."
          description="Quality, tracking, evidence volume and actual Lunavo fulfillment shape the passport. Low evidence means low confidence."
        />
        <div className="mt-5 space-y-3">
          {data.suppliers.length === 0 ? (
            <EmptyState
              title="No supplier passports yet"
              description="Record your first supplier observation below."
            />
          ) : (
            data.suppliers.map((supplier) => (
              <article
                key={supplier.domain}
                className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          supplier.passport.score >= 80
                            ? "success"
                            : supplier.passport.score >= 60
                              ? "warning"
                              : "danger"
                        }
                      >
                        {supplier.passport.score}/100
                      </Badge>
                      <span className="text-[11px] uppercase tracking-[.08em] text-[#8994a2]">
                        {supplier.passport.confidence} confidence
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-extrabold">{supplier.name}</h3>
                    <p className="text-xs text-[#697687]">{supplier.domain}</p>
                  </div>
                  <p className="font-mono text-sm">{supplier.fulfilledOrders} fulfilled orders</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Metric
                    label="Quality"
                    value={supplier.qualityScore == null ? "—" : supplier.qualityScore + "/100"}
                  />
                  <Metric
                    label="Tracking"
                    value={supplier.trackingScore == null ? "—" : supplier.trackingScore + "/100"}
                  />
                  <Metric label="Refund" value={percent(supplier.refundRateBps)} />
                  <Metric
                    label="Max ETA"
                    value={supplier.etaMaxDays == null ? "—" : supplier.etaMaxDays + "d"}
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
        <SectionHeading
          eyebrow="Supplier Switchboard"
          title="Compare alternatives before you scale."
          description="The switchboard compares latest recorded observations for the same product across supplier domains. It does not claim live quotes."
        />
        <div className="mt-5 space-y-3">
          {data.supplierOptions.length === 0 ? (
            <p className="rounded-xl bg-[#f3efe7] p-4 text-sm text-[#697687]">
              Record the same product from two or more supplier domains to build an evidence comparison.
            </p>
          ) : (
            Object.values(
              data.supplierOptions.reduce<Record<string, SupplierOption[]>>((groups, row) => {
                const key = String(row.productId);
                groups[key] = groups[key] ?? [];
                groups[key].push(row);
                return groups;
              }, {}),
            ).map((rows) => {
              if (rows.length < 2) return null;
              const product = rows[0];
              return (
                <div
                  key={String(product.productId)}
                  className="overflow-x-auto rounded-xl border border-[#e0d9cc] bg-white p-4"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-[#a2772e]" />
                    <p className="font-extrabold">{product.productTitle}</p>
                  </div>
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="text-[#8994a2]">
                      <tr>
                        <th className="pb-2">Supplier</th>
                        <th className="pb-2">Landed</th>
                        <th className="pb-2">ETA</th>
                        <th className="pb-2">Quality</th>
                        <th className="pb-2">Tracking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee9df]">
                      {rows.map((row) => (
                        <tr key={row.supplierDomain}>
                          <td className="py-3">
                            <p className="font-extrabold">{row.supplierName}</p>
                            <p className="text-[#8994a2]">{row.supplierDomain}</p>
                          </td>
                          <td className="py-3 font-mono">
                            {row.supplierCost == null || row.shippingCost == null
                              ? "Unknown"
                              : money(row.supplierCost + row.shippingCost, row.currency)}
                          </td>
                          <td className="py-3 font-mono">
                            {row.etaMaxDays == null
                              ? "Unknown"
                              : String(row.etaMinDays ?? row.etaMaxDays) + "–" + row.etaMaxDays + "d"}
                          </td>
                          <td className="py-3 font-mono">
                            {row.qualityScore == null ? "—" : row.qualityScore}
                          </td>
                          <td className="py-3 font-mono">
                            {row.trackingScore == null ? "—" : row.trackingScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
        <SectionHeading
          eyebrow="Supplier Negotiation Copilot"
          title="Turn evidence into a better supplier conversation."
          description="The self-hosted copilot uses only recorded observations and refuses to invent volume, competitors, guarantees or supplier failures."
        />
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            Supplier domain
            <select
              value={negotiationSupplier}
              onChange={(event) => setNegotiationSupplier(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose a supplier</option>
              {data.suppliers.map((supplier) => (
                <option key={supplier.domain} value={supplier.domain}>
                  {supplier.name} · {supplier.domain}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Negotiation goal
            <input
              value={negotiationGoal}
              onChange={(event) => setNegotiationGoal(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={draftNegotiation} disabled={!negotiationSupplier || negotiationBusy}>
            {negotiationBusy ? "Drafting…" : "Draft negotiation message"}
          </Button>
        </div>
        {negotiationDraft && (
          <div className="mt-4 rounded-xl border border-[#d9d2c4] bg-white p-4">
            <p className="text-[10px] font-mono uppercase tracking-[.12em] text-[#8994a2]">
              Ready-to-send draft
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#536174]">
              {negotiationDraft}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
        <SectionHeading
          eyebrow="Add evidence"
          title="Record what you actually observed."
          description="This stays manual when no external supplier/carrier API is connected. Lunavo never turns missing data into fake certainty."
        />
        <form onSubmit={saveObservation} className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Supplier domain
              <input
                required
                value={observation.supplierDomain}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, supplierDomain: event.target.value }))
                }
                className={inputClass}
                placeholder="supplier.example"
              />
            </label>
            <label className="text-sm font-bold">
              Supplier name
              <input
                value={observation.supplierName}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, supplierName: event.target.value }))
                }
                className={inputClass}
                placeholder="Acme Supply"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Product ID
              <input
                value={observation.supplierProductId}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, supplierProductId: event.target.value }))
                }
                className={inputClass}
                placeholder="Optional"
              />
            </label>
            <label className="text-sm font-bold">
              Destination country
              <input
                value={observation.destinationCountry}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, destinationCountry: event.target.value }))
                }
                className={inputClass}
                placeholder="US"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Supplier cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={observation.observedCost}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, observedCost: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="text-sm font-bold">
              Shipping cost
              <input
                type="number"
                min="0"
                step="0.01"
                value={observation.shippingCost}
                onChange={(event) =>
                  setObservation((current) => ({ ...current, shippingCost: event.target.value }))
                }
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <EvidenceInput
              label="Min days"
              value={observation.etaMinDays}
              setValue={(value) => setObservation((current) => ({ ...current, etaMinDays: value }))}
              max="365"
            />
            <EvidenceInput
              label="Max days"
              value={observation.etaMaxDays}
              setValue={(value) => setObservation((current) => ({ ...current, etaMaxDays: value }))}
              max="365"
            />
            <EvidenceInput
              label="Quality /100"
              value={observation.qualityScore}
              setValue={(value) => setObservation((current) => ({ ...current, qualityScore: value }))}
              max="100"
            />
            <EvidenceInput
              label="Tracking /100"
              value={observation.trackingScore}
              setValue={(value) => setObservation((current) => ({ ...current, trackingScore: value }))}
              max="100"
            />
          </div>
          <label className="block text-sm font-bold">
            Source URL
            <input
              value={observation.sourceUrl}
              onChange={(event) =>
                setObservation((current) => ({ ...current, sourceUrl: event.target.value }))
              }
              className={inputClass}
              placeholder="https://supplier.example/product/..."
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[#536174]">
            <input
              type="checkbox"
              checked={observation.shareWithSupplierNetwork}
              onChange={(event) =>
                setObservation((current) => ({
                  ...current,
                  shareWithSupplierNetwork: event.target.checked,
                }))
              }
            />
            Contribute this observation to the anonymized Supplier Reputation Network
          </label>
          <p className="text-[11px] leading-5 text-[#8994a2]">
            Only aggregate evidence may become public. Merchant names, customers, order IDs and private notes are never published.
          </p>
          <label className="block text-sm font-bold">
            Notes
            <textarea
              value={observation.notes}
              onChange={(event) =>
                setObservation((current) => ({ ...current, notes: event.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] p-3 text-sm outline-none"
              placeholder="Quote, sample, tracking evidence, defect report…"
            />
          </label>
          <Button type="submit" className="w-full">
            <CheckCircle2 className="h-4 w-4" />
            Record supplier evidence
          </Button>
        </form>
      </section>
    </div>
  );
}

function EvidenceInput({
  label,
  value,
  setValue,
  max,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  max: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        min="0"
        max={max}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function TrackingPanel({
  data,
  defenseBusy,
  rescueBusy,
  rescueDraft,
  buildDefense,
  rescueCustomer,
  resolveAlert,
}: {
  data: Overview;
  defenseBusy: number | null;
  rescueBusy: number | null;
  rescueDraft: string;
  buildDefense: (orderId: number) => void;
  rescueCustomer: (orderId: number) => void;
  resolveAlert: (id: string) => void;
}) {
  return (
    <div className="mt-7 grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
      <section>
        <SectionHeading
          eyebrow="Tracking-Gap Radar"
          title="Catch the silent days before the customer does."
          description="Without a carrier API, Lunavo monitors the last event you actually recorded. It never pretends that a silent carrier is a live feed."
        />
        <div className="mt-5 space-y-3">
          {data.tracking.length === 0 ? (
            <EmptyState
              title="No active tracked orders"
              description="Record a tracking checkpoint and the radar will monitor its recorded event age."
            />
          ) : (
            data.tracking.map((item) => (
              <article
                key={item.orderId}
                className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          item.gap.state === "critical"
                            ? "danger"
                            : item.gap.state === "warning"
                              ? "warning"
                              : "success"
                        }
                      >
                        {item.gap.state}
                      </Badge>
                      <span className="font-mono text-xs font-black">{item.orderNumber}</span>
                    </div>
                    <h3 className="mt-2 font-extrabold">
                      {item.carrier || "Carrier not recorded"} · {item.trackingNumber || "No tracking number"}
                    </h3>
                    <p className="mt-1 text-xs text-[#697687]">
                      {item.lastRecordedEvent || "No latest event text recorded"}
                    </p>
                  </div>
                  <p className="font-mono text-sm">
                    {item.gap.gapHours == null ? "—" : item.gap.gapHours + "h silent"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-xs text-[#697687]">
                    Last recorded: {new Date(item.lastRecordedAt).toLocaleString()}
                    {item.expectedDeliveryAt
                      ? " · expected " + new Date(item.expectedDeliveryAt).toLocaleDateString()
                      : ""}
                  </p>
                  <a
                    href={"/dropshipping?orderId=" + item.orderId}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-extrabold"
                  >
                    Open fulfillment record
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    variant="secondary"
                    onClick={() => void buildDefense(item.orderId)}
                    disabled={defenseBusy === item.orderId}
                  >
                    {defenseBusy === item.orderId ? "Packing…" : "Defense pack"}
                  </Button>
                  <Button
                    onClick={() => void rescueCustomer(item.orderId)}
                    disabled={rescueBusy === item.orderId}
                  >
                    {rescueBusy === item.orderId ? "Drafting…" : "Rescue customer"}
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
        <SectionHeading
          eyebrow="Recovery inbox"
          title="Open alerts"
          description="Resolve alerts after the underlying issue has actually been handled."
        />
        {rescueDraft && (
          <div className="mt-5 rounded-xl border border-[#b8d6ca] bg-[#eff8f3] p-4">
            <p className="text-[10px] font-mono uppercase tracking-[.12em] text-[#2f6958]">
              Customer Rescue Draft
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#315e6c]">
              {rescueDraft}
            </p>
          </div>
        )}
        <div className="mt-4 space-y-3">
          {data.alerts.length === 0 ? (
            <p className="rounded-xl bg-[#f3efe7] p-4 text-sm text-[#697687]">
              No unresolved dropship alerts.
            </p>
          ) : (
            data.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-[#e0d9cc] bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <Badge
                    tone={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "high"
                          ? "warning"
                          : "info"
                    }
                  >
                    {alert.severity}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => void resolveAlert(alert.id)}
                    className="text-xs font-extrabold text-[#315e6c]"
                  >
                    Resolve
                  </button>
                </div>
                <p className="mt-2 text-sm font-extrabold">{alert.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#697687]">{alert.message}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
