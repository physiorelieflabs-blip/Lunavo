import { type ReactNode, useState } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { BarChart3, BrainCircuit, Building2, ChevronRight, CreditCard, LayoutDashboard, LogOut, Menu, PackageCheck, Route, ShieldCheck, Store, Users, UsersRound, Warehouse, X, WalletCards, ShoppingCart, Megaphone } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Logo } from '@/components/primitives';
import { HelpBot } from '@/components/help-bot';
import { initials } from '@/lib/format';

export { Logo };

const merchantLinks = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/store', label: 'Create a new store', icon: Store },
  { href: '/ai', label: 'AI control room', icon: BrainCircuit },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/orders', label: 'Orders', icon: PackageCheck },
  { href: '/pos', label: 'TS POS', icon: ShoppingCart },
  { href: '/customers', label: 'Customers', icon: UsersRound },
  { href: '/dropshipping', label: 'Auto DS', icon: Route },
  { href: '/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
  { href: '/suppliers', label: 'Suppliers', icon: Store },
  { href: '/inventory', label: 'Inventory', icon: Warehouse },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/finance', label: 'Finance', icon: WalletCards },
];

const adminLinks = [
  { href: '/admin', label: 'Control room', icon: BarChart3 },
  { href: '/admin/merchants', label: 'Merchants', icon: Users },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
];

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const links = admin ? adminLinks : merchantLinks;
  const displayName = admin ? 'TS / OPERATIONS' : user?.fullName || 'Your workspace';
  const activeLabel = links.find((link) => location === link.href)?.label ?? (admin ? 'Control room' : 'Overview');

  return (
    <div className="noise min-h-[100dvh] bg-[#f1eee7] text-[#182333]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col bg-[#182333] px-5 py-6 text-[#f8f3e8] shadow-[16px_0_40px_rgba(24,35,51,.08)] transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-1">
          <Logo inverse />
          <button className="grid h-9 w-9 place-items-center rounded-lg text-[#9aa7b5] hover:bg-[#2b3a4e] hover:text-[#f8f3e8] md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-close-menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-12 rounded-xl border border-[#314157] bg-[#202f43] px-4 py-3.5">
          <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9aa7b5]">{admin ? 'Master admin' : 'Merchant workspace'}</p>
          <p className="mt-2 truncate text-sm font-bold text-[#ece3cf]" title={displayName}>{displayName}</p>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#7cae98]"><span className="h-1.5 w-1.5 rounded-full bg-[#7cae98]" />Live workspace</div>
        </div>
        <nav className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1" aria-label="Main navigation">
          <p className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.18em] text-[#718095]">Navigate</p>
          {links.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return <Link href={href} key={href} onClick={() => setOpen(false)} className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold ${active ? 'bg-[#d6aa46] text-[#182333] shadow-[0_8px_18px_rgba(214,170,70,.16)]' : 'text-[#aab6c2] hover:bg-[#2a3a4d] hover:text-[#f8f3e8]'}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon className="h-[17px] w-[17px]" /><span className="flex-1">{label}</span>{active && <ChevronRight className="h-4 w-4" />}</Link>;
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-[#314157] pt-4">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold text-[#aab6c2] hover:bg-[#2a3a4d] hover:text-[#f8f3e8]" data-testid="link-home"><Building2 className="h-[17px] w-[17px]" />Public site</Link>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-bold text-[#aab6c2] hover:bg-[#2a3a4d] hover:text-[#f8f3e8]" onClick={() => signOut({ redirectUrl: '/' })} data-testid="button-sign-out"><LogOut className="h-[17px] w-[17px]" />Sign out</button>
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-[#182333]/55 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-overlay" />}
      <main className="min-h-[100dvh] md:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#ddd7cb] bg-[#f1eee7]/90 px-5 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#d9d2c4] bg-[#fbfaf6] hover:bg-[#e7e2d8] md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 text-xs text-[#697687] md:flex"><span className="h-2 w-2 rounded-full bg-[#4d9b7f]" />Authenticated workspace <span className="mx-1 text-[#b7ad9d]">/</span> {activeLabel}</div>
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#697687] md:hidden">{activeLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden border-l border-[#d9d2c4] pl-4 text-right sm:block"><p className="text-xs font-extrabold">{user?.firstName || 'Merchant'}</p><p className="mt-0.5 text-[10px] text-[#697687]">{admin ? 'Administrator' : 'Store operator'}</p></div>
            <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#fbfaf6] bg-[#d8e1e3] font-mono text-xs font-bold text-[#315e6c] shadow-[0_0_0_1px_#c4d0d1]" data-testid="text-user-avatar">{initials(user?.fullName || user?.primaryEmailAddress?.emailAddress)}</div>
          </div>
        </header>
        <div className="page-enter px-5 py-8 md:px-10 md:py-10">{children}</div>
      </main>
      <HelpBot />
    </div>
  );
}

export function PublicHeader() {
  return <header className="flex items-center justify-between px-5 py-5 md:px-10"><Link href="/" data-testid="link-public-logo"><Logo /></Link><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-bold text-[#536174] hover:bg-[#e7e2d8]" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-[#182333] px-4 py-2.5 text-sm font-bold text-[#f8f3e8] shadow-[0_7px_18px_rgba(24,35,51,.12)] hover:bg-[#2a3a4d]" data-testid="link-sign-up">Open an account</Link></div></header>;
}