import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, WalletCards, AlertTriangle, Activity } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, EmptyState, ErrorState, LoadingState, MetricCard, SectionHeading } from '@/components/primitives';

type TxRow = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string | null;
  merchant_email: string | null;
  transaction_type: string;
  transaction_kind: string;
  status: string;
  verification_state: string;
  verified_at: string | null;
  amount_minor: number | string;
  currency: string;
  lunavo_fee_minor: number | string;
  provider_fee_minor: number | string;
  merchant_net_minor: number | string;
  provider: string | null;
  provider_reference: string | null;
  internal_reference: string | null;
  source: string;
  created_at: string;
};
type SummaryRow = {
  currency: string;
  transaction_count: number | string;
  attention_count: number | string;
  verified_count: number | string;
  exception_count: number | string;
};
type PendingWithdrawal = {
  id: number | string;
  merchant_id: number | string;
  merchant_name: string;
  merchant_email: string;
  amount: number | string;
  currency: string;
  status: string;
  payout_provider: string | null;
  provider_status: string | null;
  created_at: string;
};
type Feed = {
  transactions: TxRow[];
  summary: SummaryRow[];
  pendingWithdrawals: PendingWithdrawal[];
  sourceOfTruth: string;
  moneyMovement: 'read_only';
  message: string;
};
const money = (minor: number | string, currency: string) => {
  const value = Number(minor);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format((Number.isFinite(value) ? value : 0) / 100);
  } catch {
    return `${currency} ${((Number.isFinite(value) ? value : 0) / 100).toFixed(2)}`;
  }
};
const label = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : '—';
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

async function loadFeed(currency: string, verificationState: string, status: string): Promise<Feed> {
  const params = new URLSearchParams({ limit: '150' });
  if (currency) params.set('currency', currency);
  if (verificationState) params.set('verificationState', verificationState);
  if (status) params.set('status', status);
  const response = await fetch(`/api/admin/dashboard/transactions?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'The platform transaction feed could not be loaded.');
  }
  return response.json() as Promise<Feed>;
}

export default function AdminTransactions() {
  const [currency, setCurrency] = useState('');
  const [verificationState, setVerificationState] = useState('');
  const [status, setStatus] = useState('');
  const feed = useQuery({
    queryKey: ['admin-financial-control-feed', currency, verificationState, status],
    queryFn: () => loadFeed(currency, verificationState, status),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const totals = useMemo(() => (feed.data?.summary ?? []).reduce((sum, row) => ({
    transactions: sum.transactions + Number(row.transaction_count || 0),
    verified: sum.verified + Number(row.verified_count || 0),
    attention: sum.attention + Number(row.attention_count || 0),
    exceptions: sum.exceptions + Number(row.exception_count || 0),
  }), { transactions: 0, verified: 0, attention: 0, exceptions: 0 }), [feed.data?.summary]);

  return <AppShell admin>
    <div className="mx-auto max-w-[1380px] space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a2772e]">Master Admin / TS Pay</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Global money control</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697687]">One platform-wide feed for ledger projections, provider-verified payment events, fee lines, refunds, payout states, and items requiring reconciliation.</p>
        </div>
        <Button variant="secondary" onClick={() => void feed.refetch()} disabled={feed.isFetching}><RefreshCw className={`h-4 w-4 ${feed.isFetching ? 'animate-spin' : ''}`}/>Refresh feed</Button>
      </div>

      <div className="rounded-xl border border-[#dfc27a] bg-[#fff7df] p-4 text-sm leading-6 text-[#765817]">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><p><strong>Control-plane only.</strong> This screen is read-only. A dashboard row is not proof that funds moved; provider verification and the immutable TS Pay ledger are authoritative. Payouts stay pending until the payout provider confirms settlement.</p></div>
      </div>

      {feed.isLoading ? <LoadingState label="Loading platform money activity"/> :
       feed.isError ? <ErrorState onRetry={() => void feed.refetch()}/> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Activity rows" value={totals.transactions.toLocaleString()} detail="All currencies in the filtered feed" icon={<Activity className="h-5 w-5"/>}/>
          <MetricCard label="Provider-verified" value={totals.verified.toLocaleString()} detail="Confirmed and verified records" icon={<ShieldCheck className="h-5 w-5"/>}/>
          <MetricCard label="Needs attention" value={totals.attention.toLocaleString()} detail="Pending or unverified transactions" icon={<AlertTriangle className="h-5 w-5"/>}/>
          <MetricCard label="Exceptions" value={totals.exceptions.toLocaleString()} detail="Failed, reversed, disputed, or reversed records" icon={<WalletCards className="h-5 w-5"/>}/>
        </div>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="Filters" title="Inspect the whole platform" description="Filter to a currency, settlement state, or transaction status. Rows needing reconciliation are sorted first."/>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-[#53647b]">Currency
              <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0,3))} maxLength={3} placeholder="All currencies" className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm"/>
            </label>
            <label className="text-xs font-bold text-[#53647b]">Verification state
              <select value={verificationState} onChange={e=>setVerificationState(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm">
                <option value="">All states</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="reconciliation_required">Needs reconciliation</option><option value="reversed">Reversed</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#53647b]">Transaction status
              <select value={status} onChange={e=>setStatus(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#d9d2c4] bg-white px-3 text-sm">
                <option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="reconciliation_required">Needs reconciliation</option><option value="failed">Failed</option><option value="reversed">Reversed</option><option value="disputed">Disputed</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="TS Pay transaction stream" title="Money activity" description={`${feed.data?.transactions.length ?? 0} most recent records · read-only · reserve rows do not represent money received`}/>
          {feed.data?.transactions.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-[#ded8cd] bg-white">
            <table className="w-full min-w-[1080px] text-left text-xs">
              <thead className="bg-[#f0ede5] text-[10px] uppercase tracking-[.12em] text-[#697687]"><tr>
                <th className="px-3 py-3">Created / Reference</th><th className="px-3 py-3">Merchant</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Gross / currency</th><th className="px-3 py-3">Fees</th><th className="px-3 py-3">Merchant net</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Verification</th><th className="px-3 py-3">Provider</th>
              </tr></thead>
              <tbody className="divide-y divide-[#eee9df]">{feed.data.transactions.map(row => <tr key={String(row.id)} className={row.verification_state === 'reconciliation_required' ? 'bg-[#fff7df]/70' : ''} data-testid={`admin-money-row-${row.id}`}>
                <td className="px-3 py-3"><p className="font-semibold">{when(row.created_at)}</p><p className="mt-1 font-mono text-[10px] text-[#697687]">{row.internal_reference || row.idempotency_key || String(row.id)}</p></td>
                <td className="px-3 py-3"><p className="font-bold">{row.merchant_name || `Merchant #${row.merchant_id}`}</p><p className="mt-1 text-[10px] text-[#697687]">{row.merchant_email || '—'}</p></td>
                <td className="px-3 py-3"><p className="font-semibold">{label(row.transaction_type)}</p><p className="mt-1 text-[10px] text-[#697687]">{label(row.transaction_kind)} · {label(row.source)}</p></td>
                <td className="px-3 py-3 font-mono font-bold">{money(row.amount_minor,row.currency)}</td>
                <td className="px-3 py-3"><p>Lunavo {money(row.lunavo_fee_minor,row.currency)}</p><p className="mt-1 text-[10px] text-[#697687]">Provider {money(row.provider_fee_minor,row.currency)}</p></td>
                <td className="px-3 py-3 font-mono font-bold">{money(row.merchant_net_minor,row.currency)}</td>
                <td className="px-3 py-3"><Badge tone={row.status==='confirmed'?'success':row.status==='failed'||row.status==='reversed'?'danger':'warning'}>{label(row.status)}</Badge></td>
                <td className="px-3 py-3"><Badge tone={row.verification_state==='verified'?'success':row.verification_state==='reversed'?'danger':'warning'}>{label(row.verification_state)}</Badge></td>
                <td className="px-3 py-3"><p>{row.provider || 'Internal ledger'}</p><p className="mt-1 max-w-[190px] truncate font-mono text-[10px] text-[#697687]">{row.provider_reference || '—'}</p></td>
              </tr>)}</tbody>
            </table>
          </div> : <EmptyState title="No matching transactions" description="Verified payments and ledger activity will appear here after they are recorded by Lunavo's server-side financial boundary."/>}
        </section>

        <section className="rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-5 sm:p-6">
          <SectionHeading eyebrow="Payout gate" title="Withdrawals awaiting provider settlement" description="These requests reserve available funds. They must not be counted as paid until the payout provider confirms settlement."/>
          {feed.data?.pendingWithdrawals.length ? <div className="mt-4 space-y-2">{feed.data.pendingWithdrawals.map(row=><div key={String(row.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ded8cd] bg-white p-4" data-testid={`admin-payout-row-${row.id}`}>
            <div><p className="text-sm font-bold">{row.merchant_name || `Merchant #${row.merchant_id}`} · #{row.id}</p><p className="mt-1 text-xs text-[#697687]">{row.merchant_email} · {row.payout_provider || 'provider unassigned'} · {label(row.provider_status)} · {when(row.created_at)}</p></div>
            <div className="flex items-center gap-3"><p className="font-mono text-sm font-bold">{money(Math.round(Number(row.amount)*100),row.currency)}</p><Badge tone={row.status==='approved'?'info':'warning'}>{label(row.status)}</Badge></div>
          </div>)}</div> : <EmptyState title="No pending payouts" description="All currently listed payout requests have been settled, rejected, or no pending requests exist."/>}
        </section>
       </>}
    </div>
  </AppShell>;
}
