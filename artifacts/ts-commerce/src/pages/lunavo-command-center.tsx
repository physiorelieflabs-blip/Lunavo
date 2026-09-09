import { Link } from "wouter";
import { ArrowUpRight, CircleDollarSign, Package, ShoppingBag, Users, Zap } from "lucide-react";
import { LunavoApplicationShell } from "../components/lunavo-application-shell";

const metrics = [
  ["Gross sales", "—", "Live from your ledger", CircleDollarSign],
  ["Orders", "—", "Awaiting live data", ShoppingBag],
  ["Customers", "—", "Across your stores", Users],
  ["Inventory", "—", "Stock intelligence", Package],
];

const quickLinks = [
  ["Add a product", "/products", "Create and manage your catalogue."],
  ["Open TS Pay", "/payments", "Review payment states and settlement records."],
  ["Build your store", "/store-builder", "Shape the customer-facing experience."],
  ["Open Commerce Suite", "/commerce-suite", "Run commerce intelligence from one workspace."],
];

export default function LunavoCommandCenter() {
  return <LunavoApplicationShell title="Command Center" subtitle="A single operating view for every store, order and settlement.">
    <section className="lunavo-hero-strip">
      <div><span className="lunavo-kicker">TODAY / OPERATING VIEW</span><h2>Run commerce with context, not clutter.</h2><p>Connect storefront operations, money movement, customers and growth without turning the dashboard into a maze.</p></div>
      <Link href="/store-builder" className="lunavo-button lunavo-button-primary">Open Store Builder <ArrowUpRight size={16}/></Link>
    </section>
    <section className="lunavo-metric-grid">{metrics.map(([label,value,detail,Icon]) => <article className="lunavo-metric-card" key={label as string}><div className="lunavo-metric-icon"><Icon size={18}/></div><span>{label as string}</span><strong>{value as string}</strong><small>{detail as string}</small></article>)}</section>
    <section className="lunavo-dashboard-grid">
      <article className="lunavo-panel lunavo-panel-wide"><div className="lunavo-panel-heading"><div><span className="lunavo-kicker">OPERATING SIGNAL</span><h3>Commerce activity</h3></div><span className="lunavo-status-pill"><Zap size={13}/> Live data</span></div><div className="lunavo-empty-chart"><div className="lunavo-chart-line"/><span>Connect your live transactions to populate this view.</span></div></article>
      <article className="lunavo-panel"><span className="lunavo-kicker">QUICK ACTIONS</span><h3>Move something forward</h3><div className="lunavo-action-list">{quickLinks.map(([label,href,desc]) => <Link href={href as string} key={href as string}><div><strong>{label as string}</strong><span>{desc as string}</span></div><ArrowUpRight size={16}/></Link>)}</div></article>
    </section>
    <section className="lunavo-panel"><div className="lunavo-panel-heading"><div><span className="lunavo-kicker">LEDGER ANATOMY</span><h3>Money should always explain itself.</h3></div><Link href="/transactions" className="lunavo-text-link">View transactions <ArrowUpRight size={15}/></Link></div><div className="lunavo-ledger-grid">{["Gross sale","Discount","Tax","Shipping","Provider fee","Lunavo 1%","Merchant net"].map((x,i)=><div key={x}><span>{x}</span><strong>{i===5 ? "1%" : "—"}</strong></div>)}</div></section>
  </LunavoApplicationShell>;
}
