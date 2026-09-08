import { AppShell } from '@/components/app-shell';
import { Link } from 'wouter';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight,
  CircleDollarSign, Cpu, Database, Gauge, ImagePlus, PackageSearch,
  Radar, Rocket, ShieldCheck, Sparkles, Store, Truck, Workflow, Zap,
} from 'lucide-react';

const signals = [
  ['Store health', '94', '/100', 'Excellent', Gauge],
  ['Products watched', '1,248', '', '+86 this week', PackageSearch],
  ['Automation runs', '326', '', '0 failed', Workflow],
  ['Margin protected', '₦2.8M', '', '30-day estimate', CircleDollarSign],
] as const;

const agents = [
  ['Commerce Brain', 'Watching the whole store', BrainCircuit, 'Online'],
  ['Product Scout', 'Finding risers & losers', Radar, 'Scanning'],
  ['Profit Guardian', 'Protecting margins', ShieldCheck, 'Watching'],
  ['Fulfillment Agent', 'Tracking supplier risk', Truck, 'Watching'],
] as const;

const opportunities = [
  ['Three products are accelerating', 'Demand velocity is up and supplier stock is healthy.', 'Review products', '/dropshipping', 'growth'],
  ['One supplier needs attention', 'Late-fulfillment rate increased across the last 18 orders.', 'Inspect supplier', '/suppliers', 'risk'],
  ['Pricing experiment is ready', 'A safer price point could improve contribution margin.', 'Open experiment', '/commerce-suite', 'lab'],
] as const;

const quickActions = [
  ['Build a store', 'Generate a storefront from a brief', Store, '/store'],
  ['Research products', 'Find opportunities locally', Radar, '/dropshipping'],
  ['Create campaign', 'Make ads and social creatives', Sparkles, '/ad-studio'],
  ['Open TS Pay', 'Review ledger and payment operations', CircleDollarSign, '/ts-pay'],
] as const;

function FeatureCard({ icon: Icon, title, text, href }: { icon: LucideIcon; title: string; text: string; href: string }) {
  return <Link href={href} className="group rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_18px_40px_rgba(24,35,51,.08)]">
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span>
    <h3 className="mt-5 font-extrabold tracking-[-.02em]">{title}</h3>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-accent">Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span>
  </Link>;
}

export default function Dashboard() {
  return <AppShell><div className="mx-auto max-w-[1440px] space-y-7">
    <section className="overflow-hidden rounded-[28px] border border-border bg-primary text-primary-foreground shadow-[0_24px_70px_rgba(24,35,51,.16)]">
      <div className="relative p-6 md:p-9"><div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-accent"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Self-hosted core</span><span className="rounded-full bg-white/10 px-2.5 py-1.5">Flutterwave payment rail</span></div>
            <h1 className="mt-5 text-4xl font-black tracking-[-.07em] md:text-6xl">Your commerce<br className="hidden md:block" /> operating system.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/70 md:text-base">One command center for stores, products, customers, fulfillment, growth, intelligence and TS Pay. Core intelligence runs on infrastructure you control.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/commerce-suite" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-foreground shadow-lg shadow-black/10">Open Commerce OS <ArrowRight className="h-4 w-4" /></Link><Link href="/ai" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15"><BrainCircuit className="h-4 w-4" /> Ask the local brain</Link></div>
          </div>
          <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:w-[370px]"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/45">Core dependency</p><p className="mt-2 font-extrabold">None for commerce</p><p className="mt-1 text-xs text-white/55">Local services power the platform.</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/45">Payments</p><p className="mt-2 font-extrabold">TS Pay + Flutterwave</p><p className="mt-1 text-xs text-white/55">Provider evidence required.</p></div></div>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{signals.map(([label, value, suffix, detail, Icon]) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span><span className="text-[10px] font-black uppercase tracking-[.12em] text-accent">Live</span></div><p className="mt-5 text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 font-mono text-2xl font-black tracking-[-.05em]">{value}<span className="text-sm text-muted-foreground">{suffix}</span></p><p className="mt-1 text-xs font-bold text-muted-foreground">{detail}</p></div>)}</section>

    <section className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">Autonomous layer</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Your local agents are working.</h2><p className="mt-1 text-sm text-muted-foreground">They observe, explain and prepare actions. Financial state changes stay deterministic.</p></div><Link href="/ai" className="text-xs font-black text-accent underline">Open control room</Link></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{agents.map(([name, text, Icon, status]) => <div key={name} className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background text-accent"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{name}</p><p className="truncate text-xs text-muted-foreground">{text}</p></div><span className="text-[9px] font-black uppercase tracking-[.12em] text-accent">{status}</span></div>)}</div></div>
      <div className="rounded-2xl border border-border bg-muted/40 p-5 md:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Cpu className="h-5 w-5" /></span><div><p className="font-mono text-[10px] font-black uppercase tracking-[.16em] text-accent">Infrastructure</p><h2 className="mt-1 font-black">Self-hosted stack</h2></div></div><div className="mt-5 space-y-2">{[['AI runtime','Local model gateway'],['Database','PostgreSQL'],['Storage','S3-compatible object store'],['Jobs','Local workers + queues'],['Search','Local index'],['Payments','Flutterwave adapter']].map(([a,b]) => <div key={a} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"><span className="text-xs font-bold">{a}</span><span className="text-[10px] font-bold text-muted-foreground">{b}</span></div>)}</div><div className="mt-4 flex items-center gap-2 text-xs font-bold text-accent"><CheckCircle2 className="h-4 w-4" /> No core AI API key required</div></div>
    </section>

    <section><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">Command center</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Everything you can launch from here.</h2></div><Link href="/commerce-suite" className="hidden text-xs font-black text-accent underline sm:block">View all modules</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map(([title, text, Icon, href]) => <FeatureCard key={title} icon={Icon} title={title} text={text} href={href} />)}</div></section>

    <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">Autopilot radar</p><h2 className="mt-2 text-xl font-black tracking-[-.04em]">Opportunities & warnings</h2></div><Radar className="h-5 w-5 text-muted-foreground" /></div><div className="mt-5 space-y-3">{opportunities.map(([title, text, action, href, tone]) => <Link key={title} href={href} className="group flex gap-4 rounded-xl border border-border p-4 transition hover:border-accent"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone === 'risk' ? 'bg-destructive/10 text-destructive' : tone === 'growth' ? 'bg-accent/10 text-accent' : 'bg-muted text-foreground'}`}><Zap className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="font-extrabold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[.1em] text-accent">{action}<ChevronRight className="h-3 w-3 transition group-hover:translate-x-1" /></span></div></Link>)}</div></div>
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground md:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] font-black uppercase tracking-[.18em] text-accent">The impossible made local</p><h2 className="mt-2 text-xl font-black">Built for self-hosting.</h2></div><Rocket className="h-5 w-5 text-accent" /></div><p className="mt-5 text-sm leading-6 text-white/65">AI, automation, analytics, storage, search and creative tooling can run inside your own environment. Flutterwave remains the external rail for real payment processing.</p><div className="mt-5 space-y-2 text-xs">{['Local intelligence gateway','Local image & video studio','Local vector memory','Local workflow engine','Immutable TS Pay ledger'].map((item) => <div key={item} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-accent" />{item}</div>)}</div><Link href="/settings" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-black hover:bg-white/15">Configure infrastructure <ArrowRight className="h-3.5 w-3.5" /></Link></div>
    </section>

    <section className="grid gap-3 md:grid-cols-3"><Link href="/media" className="rounded-2xl border border-border bg-card p-5 transition hover:border-accent"><div className="flex items-center gap-3"><ImagePlus className="h-5 w-5 text-accent" /><span className="font-black">Creative factory</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Generate and manage product visuals locally.</p></Link><Link href="/analytics" className="rounded-2xl border border-border bg-card p-5 transition hover:border-accent"><div className="flex items-center gap-3"><Activity className="h-5 w-5 text-accent" /><span className="font-black">Business digital twin</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Model what-if scenarios before changing your store.</p></Link><Link href="/finance" className="rounded-2xl border border-border bg-card p-5 transition hover:border-accent"><div className="flex items-center gap-3"><Database className="h-5 w-5 text-accent" /><span className="font-black">Financial control</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Separate provider evidence, ledger state and merchant accounting.</p></Link></section>
  </div></AppShell>;
}
