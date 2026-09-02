import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { BarChart3, Building2, CreditCard, LayoutDashboard, LogOut, Menu, PackageCheck, Users, UsersRound, X } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { Logo } from '@/components/primitives';
import { initials } from '@/lib/format';
import { useState } from 'react';

export { Logo };

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const merchantLinks = [{ href: '/dashboard', label: 'Overview', icon: LayoutDashboard }, { href: '/orders', label: 'Orders', icon: PackageCheck }, { href: '/customers', label: 'Customers', icon: UsersRound }, { href: '/billing', label: 'Billing', icon: CreditCard }];
  const adminLinks = [{ href: '/admin', label: 'Control room', icon: BarChart3 }, { href: '/admin/merchants', label: 'Merchants', icon: Users }];
  const links = admin ? adminLinks : merchantLinks;
  return <div className="noise min-h-[100dvh] bg-[#f1eee7] text-[#182333]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#182333] px-4 py-5 text-[#f8f3e8] transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-2"><Logo inverse /><button className="md:hidden" onClick={() => setOpen(false)} data-testid="button-close-menu"><X className="h-5 w-5" /></button></div>
      <div className="mt-10 px-2"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8997a8]">{admin ? 'Master admin' : 'Merchant workspace'}</p><p className="mt-2 text-sm font-bold text-[#e6ddc8]">{admin ? 'TS / OPERATIONS' : user?.fullName || 'Your workspace'}</p></div>
      <nav className="mt-9 space-y-1" aria-label="Main navigation">{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold ${location === href ? 'bg-[#d6aa46] text-[#182333]' : 'text-[#aab6c2] hover:bg-[#26364a] hover:text-[#f8f3e8]'}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon className="h-[17px] w-[17px]" />{label}</Link>)}</nav>
      <div className="mt-auto space-y-1 border-t border-[#334256] pt-4"><Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-[#aab6c2] hover:bg-[#26364a] hover:text-[#f8f3e8]" data-testid="link-home"><Building2 className="h-[17px] w-[17px]" />Public site</Link><button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-[#aab6c2] hover:bg-[#26364a] hover:text-[#f8f3e8]" onClick={() => signOut({ redirectUrl: '/' })} data-testid="button-sign-out"><LogOut className="h-[17px] w-[17px]" />Sign out</button></div>
    </aside>
    {open && <button className="fixed inset-0 z-30 bg-[#182333]/40 md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-overlay" />}
    <main className="min-h-[100dvh] md:pl-[252px]"><header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#ddd7cb] bg-[#f1eee7]/95 px-5 backdrop-blur md:px-10"><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#e5e0d6] md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 text-xs text-[#697687] md:flex"><span className="h-2 w-2 rounded-full bg-[#4d9b7f]" />Authenticated workspace</div><div className="ml-auto flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#d8e1e3] font-mono text-xs font-bold text-[#315e6c]" data-testid="text-user-avatar">{initials(user?.fullName || user?.primaryEmailAddress?.emailAddress)}</div></div></header><div className="page-enter px-5 py-8 md:px-10 md:py-10">{children}</div></main>
  </div>;
}

export function PublicHeader() {
  return <header className="flex items-center justify-between px-5 py-5 md:px-10"><Link href="/" data-testid="link-public-logo"><Logo /></Link><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-bold text-[#536174] hover:bg-[#e7e2d8]" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-[#182333] px-4 py-2.5 text-sm font-bold text-[#f8f3e8] hover:bg-[#25354a]" data-testid="link-sign-up">Open an account</Link></div></header>;
}