import { useEffect, useState } from "react";
import { Activity, CheckCircle2, TrendingUp, TriangleAlert } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/primitives";

type Scorecard = {
  supplierId: number | null;
  supplierName: string;
  products: number;
  inStockProducts: number;
  fulfillmentJobs: number;
  shippedJobs: number;
  deliveredJobs: number;
  failedJobs: number;
  onTimeRate: number | null;
  deliveryRate: number | null;
  failureRate: number | null;
  stockCoverageRate: number | null;
  score: number;
  recommendation: "preferred" | "watch" | "avoid";
};

export function SupplierScorecards() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void customFetch<{ scorecards: Scorecard[] }>("/api/merchant/dropshipping/supplier-scorecards", { responseType: "json" })
      .then((result) => setScorecards(result.scorecards ?? []))
      .catch(() => setScorecards([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-sm text-[#b8c2cc]">Loading supplier scorecards…</section>;
  return <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#182333] p-6 text-[#f8f3e8] md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Supplier intelligence</p><h2 className="mt-2 text-2xl font-extrabold">Choose suppliers by real performance.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#b8c2cc]">Lunavo combines stock coverage, delivery, failure, and timeliness signals so sourcing decisions are not based on price alone.</p></div><Activity className="h-6 w-6 text-[#d6aa46]" /></div>
    {scorecards.length ? <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {scorecards.map((item) => {
        const icon = item.recommendation === "preferred" ? <CheckCircle2 className="h-4 w-4" /> : item.recommendation === "avoid" ? <TriangleAlert className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />;
        const tone = item.recommendation === "preferred" ? "success" : item.recommendation === "avoid" ? "danger" : "warning";
        return <article key={String(item.supplierId) + item.supplierName} className="rounded-xl border border-[#46566a] bg-[#1e2b3c] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{item.supplierName}</p><p className="mt-1 text-xs text-[#8fa1b2]">{item.products} products · {item.inStockProducts} in stock</p></div><Badge tone={tone as "success" | "danger" | "warning"}>{icon}{item.score}/100</Badge></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-[#c9d3dc]"><span>Delivery {item.deliveryRate === null ? "—" : item.deliveryRate + "%"}</span><span>On time {item.onTimeRate === null ? "—" : item.onTimeRate + "%"}</span><span>Failure {item.failureRate === null ? "—" : item.failureRate + "%"}</span><span>Jobs {item.fulfillmentJobs}</span></div>
          <p className="mt-3 text-xs font-bold text-[#f8f3e8]">{item.recommendation === "preferred" ? "Preferred for automatic sourcing." : item.recommendation === "avoid" ? "Avoid automatic fallback until reliability improves." : "Keep under review and compare with alternatives."}</p>
        </article>;
      })}
    </div> : <p className="mt-6 text-sm text-[#8fa1b2]">No supplier history is available yet. Scorecards will improve as real supplier-backed fulfillment events are recorded.</p>}
  </section>;
}