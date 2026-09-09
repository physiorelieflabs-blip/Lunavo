import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";

export type LunavoNavItem = {
  label: string;
  href: string;
  description?: string;
  badge?: string;
};

export type LunavoNavGroup = {
  label: string;
  items: LunavoNavItem[];
};

const groups: LunavoNavGroup[] = [
  { label: "Command", items: [{ label: "Overview", href: "/dashboard" }, { label: "Analytics", href: "/analytics" }] },
  { label: "Commerce", items: [{ label: "Orders", href: "/orders" }, { label: "Products", href: "/products" }, { label: "Inventory", href: "/inventory" }, { label: "Customers", href: "/customers" }, { label: "Reviews", href: "/reviews" }] },
  { label: "Sell", items: [{ label: "Store Builder", href: "/store-builder" }, { label: "Themes", href: "/themes" }, { label: "Marketplace", href: "/marketplace" }, { label: "Digital Products", href: "/digital-products" }, { label: "Courses", href: "/courses" }, { label: "Memberships", href: "/memberships" }, { label: "Services", href: "/services" }, { label: "Bookings", href: "/bookings" }, { label: "Events", href: "/events" }, { label: "Subscriptions", href: "/subscriptions" }] },
  { label: "Money", items: [{ label: "TS Pay", href: "/payments" }, { label: "Transactions", href: "/transactions" }, { label: "Payouts", href: "/payouts" }, { label: "Invoices", href: "/invoices" }, { label: "Refunds & disputes", href: "/refunds" }] },
  { label: "Operate", items: [{ label: "Shipping", href: "/shipping" }, { label: "Taxes", href: "/taxes" }, { label: "Marketing", href: "/marketing" }, { label: "Domains", href: "/domains" }, { label: "Integrations", href: "/integrations" }, { label: "API & Webhooks", href: "/developer" }] },
  { label: "Intelligence", items: [{ label: "Commerce Suite", href: "/commerce-suite" }, { label: "Frontier Lab", href: "/frontier-lab" }] },
];

export function LunavoApplicationShell({ children, title = "Command Center", subtitle = "Your commerce, one operating layer." }: { children: ReactNode; title?: string; subtitle?: string }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  return (
    <div className="lunavo-app-shell">
      <aside className={`lunavo-sidebar ${open ? "is-open" : ""}`}>
        <div className="lunavo-brand"><span className="lunavo-brand-mark">L</span><span>Lunavo</span></div>
        <div className="lunavo-sidebar-scroll">
          {groups.map((group) => <section key={group.label} className="lunavo-nav-group">
            <div className="lunavo-nav-label">{group.label}</div>
            {group.items.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`lunavo-nav-item ${location === item.href ? "is-active" : ""}`}>
              <span>{item.label}</span>{item.badge && <span className="lunavo-nav-badge">{item.badge}</span>}
            </Link>)}
          </section>)}
        </div>
        <div className="lunavo-sidebar-footer"><Link href="/settings" className="lunavo-nav-item">Settings</Link><div className="lunavo-security-note">Protected operating environment</div></div>
      </aside>
      {open && <button aria-label="Close navigation" className="lunavo-sidebar-scrim" onClick={() => setOpen(false)} />}
      <main className="lunavo-app-main">
        <header className="lunavo-app-header">
          <button className="lunavo-mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X size={20} /> : <Menu size={20} />}</button>
          <div><div className="lunavo-eyebrow">LUNAVO OPERATING SYSTEM</div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="lunavo-header-actions"><button className="lunavo-control">All stores <ChevronDown size={15} /></button><button className="lunavo-avatar" aria-label="Account">TS</button></div>
        </header>
        <div className="lunavo-app-content">{children}</div>
      </main>
    </div>
  );
}

export const lunavoNavigation = groups;
