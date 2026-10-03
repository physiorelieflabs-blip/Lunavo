import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, RefreshCw } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge, Button, EmptyState, LoadingState } from "@/components/primitives";
import { money, timeAgo } from "@/lib/format";

type FinancialData = {
  transactions: Array<{ id: number; transaction_type: string; transaction_kind: string; status: string; verification_state: string; amount_minor: number | string; currency: string; merchant_net_minor: number | string | null; provider: string | null; provider_reference: string | null; internal_reference: string; source: string; created_at: string }>;
  balances: Array<{ currency: string; ledgerBalanceMinor: number | string; withdrawalHoldMinor: number | string; earningsHeldMinor: number | string; availableBalanceMinor: number | string }>;
  sourceOfTruth: string;
};

export function FinancialDashboardPanel() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = () => { setLoading(true); setError(false); void customFetch<FinancialData>("/api/merchant/dashboard/transactions?limit=8", { responseType: "json" }).then(setData).catch(() => setError(true)).finally(() => setLoading(false)); };
  useEffect(load, []);
  return <section className="rounded-2xl border border-[#dfe5ec] bg-white shadow-[0_8px_28px_rgba(15,31,48,.045)] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#617494]">TS Pay financial control</p><h2 className="mt-1 text-[18px] font-black text-[#14253c]">Money trail</h2><p className="mt-1 text-[10px] text-[#77859a]">Ledger balances, holds and every projected financial event shown from the server-side financial read model.</p></div><Button type="button" variant="secondary" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    {loading ? <div className="mt-5"><LoadingState label="Loading financial activity" /></div> : error ? <div className="mt-5"><EmptyState title="Financial activity unavailable" description="The dashboard could not load the server-side TS Pay read model." /></div> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data?.balances?.map((b) => <div key={b.currency} className="rounded-xl border border-[#e3e8ee] bg-[#f8fafc] p-4"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-[.12em] text-[#718097]">{b.currency} available</span><CircleDollarSign className="h-4 w-4 text-[#3569c9]" /></div><p className="mt-2 font-mono text-xl font-black">{money(Number(b.availableBalanceMinor) / 100, b.currency)}</p><p className="mt-1 text-[9px] text-[#7e8b9d]">Ledger {money(Number(b.ledgerBalanceMinor) / 100, b.currency)} · Hold {money((Number(b.withdrawalHoldMinor)+Number(b.earningsHeldMinor)) / 100, b.currency)}</p></div>)}</div>
      {data?.transactions?.length ? <div className="mt-5 divide-y rounded-xl border border-[#e3e8ee]">{data.transactions.slice(0,8).map((t) => { const signed=Number(t.merchant_net_minor ?? 0); const positive=signed>=0; return <div key={t.id} className="flex items-center gap-3 px-4 py-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${positive?"bg-[#e9f8f1] text-[#15956b]":"bg-[#fff0ed] text-[#b44a40]"}`}>{positive?<ArrowDownLeft className="h-3.5 w-3.5"/>:<ArrowUpRight className="h-3.5 w-3.5"/>}</span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-extrabold">{String(t.transaction_type).replaceAll("_"," ")}</p><p className="truncate text-[9px] text-[#7d899b]">{t.provider ? `${t.provider} · ` : ""}{t.provider_reference || t.internal_reference} · {timeAgo(t.created_at)}</p></div><div className="text-right"><p className={`font-mono text-[10px] font-black ${positive?"text-[#15956b]":"text-[#b44a40]"}`}>{positive?"+":"−"}{money(Math.abs(Number(t.merchant_net_minor ?? t.amount_minor))/100,t.currency)}</p><Badge tone={t.status==="confirmed"&&t.verification_state==="verified"?"success":t.status==="failed"?"danger":"warning"}>{t.status}</Badge></div></div>; })}</div> : <div className="mt-5"><EmptyState title="No financial events yet" description="Verified payments, fees, refunds, transfers and withdrawal activity will appear here when recorded." /></div>}
      <p className="mt-3 text-[9px] text-[#7e8b9d]">{data?.sourceOfTruth}</p>
    </>}
  </section>;
}
