import { type ReactNode, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, PackageCheck, UsersRound, Warehouse } from 'lucide-react';
import { Link } from 'wouter';
import { customFetch, useGetDashboardOverview } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, ErrorState, LoadingState, MetricCard, SectionHeading } from '@/components/primitives';
import { money } from '@/lib/format';

type AnalyticsDetails = {
  generatedAt: string;
  currency: string;
  topCustomers: Array<{ id: number; name: string; email: string; order_count: number; revenue: string | number }>;
  topProducts: Array<{ id: number; title: string; currency: string; order_count: number; units_sold: number; revenue: string | number }>;
  inventory: { lowStockCount: number; outOfStockCount: number; trackedUnits: number; trackedProducts: number };
  advertising: { campaigns: number; impressions: number; clicks: number; productViews: number; addToCarts: number; purchases: number; attributedRevenueMinor: number };
};

export default function Analytics() {
  const overview = useGetDashboardOverview();
  const details = useAsyncDetails();

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

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading eyebrow="Customers" title="Highest-value customer records" description="Real paid/fulfilled order history for this merchant only." />
            {details.loading ? <div className="mt-5"><LoadingState label="Loading customer analytics" /></div> : details.data?.topCustomers.length ? <div className="mt-5 space-y-2">{details.data.topCustomers.map((customer) => <div key={customer.id} className="flex items-center justify-between gap-4 rounded-lg border border-[#e3ddd2] bg-[#f7f4ed] p-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{customer.name}</p><p className="truncate text-xs text-[#7b8796]">{customer.email} · {customer.order_count} order{customer.order_count===1?'':'s'}</p></div><strong className="font-mono text-sm">{money(Number(customer.revenue), data.currency)}</strong></div>)}</div> : <div className="mt-5"><EmptyState title="No customer revenue yet" description="Verified paid sales will populate this view." /></div>}
          </section>
          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading eyebrow="Products" title="Top product performance" description="Revenue and units sold from merchant-owned supplier products." />
            {details.loading ? <div className="mt-5"><LoadingState label="Loading product analytics" /></div> : details.data?.topProducts.length ? <div className="mt-5 space-y-2">{details.data.topProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-4 rounded-lg border border-[#e3ddd2] bg-[#f7f4ed] p-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{product.title}</p><p className="text-xs text-[#7b8796]">{product.units_sold} unit{product.units_sold===1?'':'s'} · {product.order_count} order{product.order_count===1?'':'s'}</p></div><strong className="font-mono text-sm">{money(Number(product.revenue), data.currency)}</strong></div>)}</div> : <div className="mt-5"><EmptyState title="No product sales yet" description="Verified paid sales will populate this view." /></div>}
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading eyebrow="Inventory" title="Stock pressure" description="Current supplier-product quantities and explicit low/out-of-stock states." />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <DataCard icon={<Warehouse className="h-4 w-4" />} label="Low stock" value={String(details.data?.inventory.lowStockCount ?? 0)} />
              <DataCard icon={<PackageCheck className="h-4 w-4" />} label="Out of stock" value={String(details.data?.inventory.outOfStockCount ?? 0)} />
              <DataCard icon={<BarChart3 className="h-4 w-4" />} label="Tracked products" value={String(details.data?.inventory.trackedProducts ?? 0)} />
              <DataCard icon={<Warehouse className="h-4 w-4" />} label="Tracked units" value={String(details.data?.inventory.trackedUnits ?? 0)} />
            </div>
          </section>
          <section className="rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] p-6">
            <SectionHeading eyebrow="Advertising" title="Tracked campaign funnel" description="Only recorded campaign events are shown; untracked impressions are never invented." />
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              <DataCard label="Campaigns" value={String(details.data?.advertising.campaigns ?? 0)} />
              <DataCard label="Impressions" value={String(details.data?.advertising.impressions ?? 0)} />
              <DataCard label="Clicks" value={String(details.data?.advertising.clicks ?? 0)} />
              <DataCard label="Product views" value={String(details.data?.advertising.productViews ?? 0)} />
              <DataCard label="Add to carts" value={String(details.data?.advertising.addToCarts ?? 0)} />
              <DataCard label="Purchases" value={String(details.data?.advertising.purchases ?? 0)} />
            </div>
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

function useAsyncDetails() {
  const [state, setState] = useState<{loading:boolean;data:AnalyticsDetails|null}>({loading:true,data:null});
  useEffect(() => {
    let active=true;
    void customFetch<AnalyticsDetails>('/api/analytics/details').then((data)=>{if(active)setState({loading:false,data})}).catch(()=>{if(active)setState({loading:false,data:null})});
    return ()=>{active=false};
  }, []);
  return state;
}

function DataCard({icon,label,value}:{icon?:ReactNode;label:string;value:string}) {
  return <div className="rounded-lg border border-[#e3ddd2] bg-[#f7f4ed] p-4"><div className="flex items-center gap-2 text-[#7b8796]">{icon}<span className="text-[10px] font-extrabold uppercase tracking-[.12em]">{label}</span></div><p className="mt-2 font-mono text-xl font-bold text-[#182333]">{value}</p></div>;
}
