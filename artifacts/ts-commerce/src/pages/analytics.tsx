import { ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, UsersRound } from 'lucide-react';
import { Link } from 'wouter';
import { useGetDashboardOverview } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState, MetricCard, SectionHeading } from '@/components/primitives';
import { money } from '@/lib/format';

export default function Analytics() {
  const overview = useGetDashboardOverview();
  if (overview.isLoading) return <AppShell><LoadingState label="Loading analytics" /></AppShell>;
  if (overview.isError || !overview.data) return <AppShell><ErrorState onRetry={() => void overview.refetch()} /></AppShell>;
  const data = overview.data;
  const maxRevenue = Math.max(...data.revenueSeries.map((point) => point.amount), 1);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1320px]">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Performance workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Analytics that stays tied to your ledger.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">A seven-day snapshot of recorded sales, customers, orders, and available funds. Pending orders are not counted as revenue.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-extrabold">
            <Link href="/orders" className="inline-flex items-center gap-2 rounded-lg bg-[#182333] px-4 py-2.5 text-[#f8f3e8]">View orders</Link>
            <Link href="/customers" className="inline-flex items-center gap-2 rounded-lg border border-[#d9d2c4] bg-[#fbfaf6] px-4 py-2.5 text-[#536174]">View customers</Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Recorded revenue" value={money(data.revenue, data.currency)} detail={<span className="inline-flex items-center gap-1 text-[#2f6958]"><ArrowUpRight className="h-3.5 w-3.5" />{data.revenueChange}% from prior period</span>} icon={<CircleDollarSign className="h-5 w-5" />} />
          <MetricCard label="Orders" value={String(data.orders)} detail="All order states in your workspace" icon={<BarChart3 className="h-5 w-5" />} />
          <MetricCard label="Customer records" value={String(data.customers)} detail="Customers connected to your store" icon={<UsersRound className="h-5 w-5" />} />
          <MetricCard label="Available balance" value={money(data.availableBalance, data.currency)} detail={<span className="inline-flex items-center gap-1 text-[#2f6958]"><ArrowUpRight className="h-3.5 w-3.5" />Ready for approved withdrawal</span>} icon={<CircleDollarSign className="h-5 w-5" />} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
            <SectionHeading eyebrow="Last seven days" title="Revenue movement" description="Recorded paid sales by day in your selected dashboard currency." />
            {data.revenueSeries.some((point) => point.amount > 0) ? (
              <div className="mt-8 flex h-64 items-end gap-2 border-b border-l border-[#d5cdbd] px-3 pb-0 pt-6 md:gap-4">
                {data.revenueSeries.map((point) => (
                  <div key={point.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div className="relative w-full max-w-14 rounded-t-md bg-[#c85d3f] transition group-hover:bg-[#182333]" style={{ height: `${Math.max((point.amount / maxRevenue) * 88, point.amount > 0 ? 6 : 0)}%` }} title={money(point.amount, data.currency)} />
                    <span className="font-mono text-[10px] text-[#8994a2]">{point.label}</span>
                  </div>
                ))}
              </div>
            ) : <div className="mt-6"><EmptyState title="No recorded revenue yet" description="Verified paid sales will appear here by day." /></div>}
          </section>

          <section className="rounded-xl border border-[#344454] bg-[#1f2b38] p-6 text-[#f8f3e8] md:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#e17d5d]">Cash position</p>
            <h2 className="mt-2 text-xl font-extrabold">Where funds sit</h2>
            <div className="mt-8 space-y-5">
              <DataRow label="Available" value={money(data.availableBalance, data.currency)} />
              <DataRow label="Pending orders" value={money(data.pendingBalance, data.currency)} />
              <DataRow label="Reserved withdrawals" value={money(data.withdrawalReserved, data.currency)} />
              <DataRow label="Held for platform fee" value={money(data.earningsHeldForSubscription, data.currency)} brass />
            </div>
            <p className="mt-8 border-t border-[#46566a] pt-4 text-xs leading-5 text-[#aab6c2]">Available balance excludes pending orders, approved withdrawal reserves, and the amount held for your platform subscription.</p>
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
          <SectionHeading eyebrow="Next actions" title="Turn the snapshot into action" />
          <div className="grid gap-3 md:grid-cols-3">
            <Action href="/orders" title="Review pending orders" description="Verify payment or cancel orders before fulfillment." />
            <Action href="/inventory" title="Check stock pressure" description="Review holds and movements before the next sale." />
            <Action href="/marketing" title="Plan a campaign" description="Use your customer and sales context to prepare the next offer." />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function DataRow({ label, value, brass = false }: { label: string; value: string; brass?: boolean }) {
  return <div className="flex items-center justify-between border-b border-[#46566a] pb-3 last:border-0"><span className={`text-sm ${brass ? 'text-[#d6aa46]' : 'text-[#aab6c2]'}`}>{label}</span><strong className={`font-mono text-sm ${brass ? 'text-[#f0d894]' : 'text-[#f8f3e8]'}`}>{value}</strong></div>;
}

function Action({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="group rounded-lg border border-[#ded8cd] bg-[#f7f4ed] p-4 hover:border-[#bca26a]"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">{title}</h3><ArrowDownRight className="h-4 w-4 rotate-[-45deg] text-[#a2772e] transition group-hover:translate-x-1" /></div><p className="mt-1 text-xs leading-5 text-[#697687]">{description}</p></Link>;
}