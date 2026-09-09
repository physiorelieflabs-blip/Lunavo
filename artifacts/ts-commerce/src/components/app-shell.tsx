import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCurrentWorkspaceQueryKey, getListAccessibleWorkspacesQueryKey, getListMerchantsQueryKey, getSelectedWorkspaceId, setSelectedWorkspaceId, useGetCurrentWorkspace, useListAccessibleWorkspaces, useListMerchants } from '@workspace/api-client-react';
import { useClerk, useUser } from '@clerk/react';
import { ArrowLeft, BarChart3, Bell, BookOpen, BrainCircuit, Building2, ChevronDown, ChevronRight, CircleHelp, CreditCard, FileText, Gavel, Globe2, ImagePlus, Landmark, LayoutDashboard, LineChart, LogOut, Menu, Megaphone, PackageCheck, PanelLeftClose, PanelLeftOpen, Route, Settings2, ShieldCheck, ShoppingCart, Store, Users, UsersRound, Warehouse, WalletCards, X, Clapperboard, KeyRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { ErrorState, LoadingState, Logo } from '@/components/primitives';
import { HelpBot } from '@/components/help-bot';
import { initials } from '@/lib/format';

export { Logo };

const merchantGroups = [
  { label: 'Workspace', items: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/guide', label: 'Learn & Guide', icon: BookOpen },
    { href: '/analytics', label: 'Analytics', icon: LineChart },
  ]},
  { label: 'Sell', items: [
    { href: '/store', label: 'Storefront', icon: Store },
    { href: '/commerce-suite', label: 'Commerce Suite', icon: ShoppingCart },
    { href: '/orders', label: 'Orders', icon: PackageCheck },
    { href: '/customers', label: 'Customers', icon: UsersRound },
    { href: '/invoices', label: 'Invoices', icon: FileText },
    { href: '/pos', label: 'Lunavo POS', icon: ShoppingCart },
  ]},
  { label: 'Grow', items: [
    { href: '/marketing', label: 'Marketing', icon: Megaphone },
    { href: '/ad-studio', label: 'Ad Studio', icon: Clapperboard },
    { href: '/ai', label: 'AI control room', icon: BrainCircuit },
    { href: '/general-store', label: 'General Store', icon: Globe2 },
    { href: '/marketplace/manage', label: 'Marketplace', icon: Globe2 },
    { href: '/auctions/manage', label: 'Auctions', icon: Gavel },
  ]},
  { label: 'Operations', items: [
    { href: '/inventory', label: 'Inventory', icon: Warehouse },
    { href: '/suppliers', label: 'Suppliers', icon: Store },
    { href: '/dropshipping', label: 'Fulfillment', icon: Route },
    { href: '/finance', label: 'Finance', icon: WalletCards },
    { href: '/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
    { href: '/ts-pay', label: 'TS Pay', icon: Landmark },
  ]},
  { label: 'Manage', items: [
    { href: '/team', label: 'Team & locations', icon: Users },
    { href: '/media', label: 'Media library', icon: ImagePlus },
    { href: '/activity', label: 'Activity', icon: Bell },
    { href: '/billing', label: 'Billing', icon: CreditCard },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ]},
];

const adminGroups = [
  { label: 'Control', items: [
    { href: '/admin', label: 'Overview', icon: BarChart3 },
    { href: '/admin/merchants', label: 'Merchants', icon: Users },
    { href: '/admin/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
    { href: '/admin/integrations', label: 'Integrations', icon: KeyRound },
  ]},
];

const ADMIN_EMAIL = 'ifeoluwaolowu4@gmail.com';

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Sell: true, Grow: true, Operations: true, Manage: false });
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(() => getSelectedWorkspaceId());
  const isMasterAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress.verification?.status === 'verified';
  const adminMerchants = useListMerchants({ query: { queryKey: getListMerchantsQueryKey(), enabled: admin && isLoaded && !!user, retry: false, staleTime: 60_000 } });
  const workspaces = useListAccessibleWorkspaces({ query: { queryKey: getListAccessibleWorkspacesQueryKey(), enabled: !admin && !isMasterAdmin && isLoaded && !!user, retry: false, staleTime: 60_000 } });
  const currentWorkspace = useGetCurrentWorkspace({ query: { queryKey: getGetCurrentWorkspaceQueryKey(), enabled: !admin && isLoaded && !!user && ((isMasterAdmin && Boolean(selectedWorkspace)) || (!isMasterAdmin && workspaces.isFetched && (Boolean(selectedWorkspace) || workspaces.data?.length === 0))), retry: false, staleTime: 60_000 } });
  const isAdminPreview = isMasterAdmin && !admin && Boolean(selectedWorkspace);
  const groups = admin ? adminGroups : merchantGroups;

  useEffect(() => {
    if (!isLoaded) return;
    setSelectedWorkspaceId(undefined, user?.id ?? null);
    setSelectedWorkspace(getSelectedWorkspaceId());
    queryClient.clear();
  }, [isLoaded, user?.id, queryClient]);
  useEffect(() => {
    if (admin || isMasterAdmin || !workspaces.data?.length) return;
    const available = new Set(workspaces.data.map((workspace) => String(workspace.id)));
    const next = selectedWorkspace && available.has(selectedWorkspace) ? selectedWorkspace : String(workspaces.data[0]!.id);
    if (next !== selectedWorkspace) { setSelectedWorkspace(next); setSelectedWorkspaceId(next); queryClient.clear(); }
  }, [admin, isMasterAdmin, queryClient, selectedWorkspace, workspaces.data]);
  useEffect(() => {
    if (currentWorkspace.data?.id == null) return;
    const next = String(currentWorkspace.data.id);
    if (next !== selectedWorkspace) { setSelectedWorkspace(next); setSelectedWorkspaceId(next); }
  }, [currentWorkspace.data?.id, selectedWorkspace]);

  const displayName = admin ? 'Lunavo Operations' : currentWorkspace.data?.storeName || user?.fullName || 'Your workspace';
  const active = useMemo(() => groups.flatMap((g) => g.items).sort((a, b) => b.href.length - a.href.length).find((item) => location === item.href || location.startsWith(`${item.href}/`)), [groups, location]);
  const switchWorkspace = (merchantId: number) => { if (merchantId === currentWorkspace.data?.id) return; setSelectedWorkspace(String(merchantId)); setSelectedWorkspaceId(merchantId); queryClient.clear(); setLocation('/dashboard'); };
  const switchToMerchant = (merchantId: number) => { setSelectedWorkspace(String(merchantId)); setSelectedWorkspaceId(merchantId); queryClient.clear(); setLocation('/dashboard'); };
  const returnToAdmin = () => { setSelectedWorkspace(null); setSelectedWorkspaceId(null); queryClient.clear(); setLocation('/admin'); };
  const switchAccount = () => { setSelectedWorkspaceId(null); queryClient.clear(); void signOut({ redirectUrl: '/sign-in' }); };
  const switchToCustomerProfile = () => { window.localStorage.setItem('lunavo-role', 'customer'); queryClient.clear(); setLocation('/general-store'); };
  const goBack = () => { if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back(); else setLocation(admin ? '/admin' : '/dashboard'); };

  if (!isLoaded || (!admin && !isMasterAdmin && !workspaces.isFetched) || (!admin && isMasterAdmin && Boolean(selectedWorkspace) && !currentWorkspace.isFetched)) return <div className="min-h-[100dvh] bg-background p-6"><LoadingState label="Loading workspace" /></div>;
  if (!admin && workspaces.isError) return <div className="min-h-[100dvh] bg-background p-6"><ErrorState onRetry={() => { void workspaces.refetch(); }} /></div>;
  if (!admin && currentWorkspace.isError) return <div className="min-h-[100dvh] bg-background p-6"><ErrorState onRetry={() => { void currentWorkspace.refetch(); }} /></div>;
  if (!admin && (!currentWorkspace.isFetched || !currentWorkspace.data)) return <div className="min-h-[100dvh] bg-background p-6"><LoadingState label="Opening workspace" /></div>;

  return <div className="min-h-[100dvh] bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card/95 backdrop-blur-xl transition-all duration-200 ${collapsed ? 'w-[76px]' : 'w-[272px]'} ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className={`flex h-[72px] items-center border-b border-border ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        {!collapsed && <Logo />}
        <button type="button" onClick={() => collapsed ? setCollapsed(false) : setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="hidden h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:grid" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button>
      </div>
      <div className={`${collapsed ? 'px-2' : 'px-4'} pt-4`}>
        <div className={`rounded-xl border border-border bg-muted/50 ${collapsed ? 'p-2' : 'p-3'}`}>
          {collapsed ? <div className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background text-xs font-black">{initials(displayName)}</div> : <><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{admin ? 'Master admin' : 'Workspace'}</p><p className="mt-1 truncate text-sm font-bold">{displayName}</p>{admin && <select aria-label="Switch merchant account" defaultValue="" onChange={(e) => switchToMerchant(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold"><option value="">View merchant…</option>{adminMerchants.data?.filter((m) => m.email.toLowerCase() !== ADMIN_EMAIL).map((m) => <option key={m.id} value={m.id}>{m.storeName}</option>)}</select>}{!admin && !isMasterAdmin && (workspaces.data?.length ?? 0) > 1 && <select aria-label="Switch workspace" value={currentWorkspace.data?.id ?? ''} onChange={(e) => switchWorkspace(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold"><option value="" disabled>Choose workspace</option>{workspaces.data?.map((w) => <option key={w.id} value={w.id}>{w.storeName}</option>)}</select>}</>}
        </div>
      </div>
      <nav className="mt-5 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {groups.map((group) => { const isOpen = expanded[group.label] ?? true; return <div key={group.label} className="mb-4"><button type="button" onClick={() => !collapsed && setExpanded((v) => ({ ...v, [group.label]: !isOpen }))} className={`${collapsed ? 'hidden' : 'flex'} mb-1 w-full items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground`}>{group.label}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`} /></button>{isOpen && group.items.map(({ href, label, icon: Icon }) => { const selected = location === href || location.startsWith(`${href}/`); return <Link key={href} href={href} onClick={() => setOpen(false)} title={collapsed ? label : undefined} data-active={selected} className={`group mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${selected ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${collapsed ? 'justify-center' : ''}`}><Icon className="h-[17px] w-[17px] shrink-0" /><span className={collapsed ? 'hidden' : 'flex-1'}>{label}</span>{selected && !collapsed && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}</Link>; })}</div>; })}
      </nav>
      <div className={`${collapsed ? 'px-2' : 'px-3'} border-t border-border py-3`}>
        {isAdminPreview && <button onClick={returnToAdmin} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center' : ''}`}><ArrowLeft className="h-[17px] w-[17px]" /><span className={collapsed ? 'hidden' : ''}>Return to admin</span></button>}
        <Link href="/" className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center' : ''}`}><Building2 className="h-[17px] w-[17px]" /><span className={collapsed ? 'hidden' : ''}>Public site</span></Link>
        {!admin && <button onClick={switchToCustomerProfile} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center' : ''}`}><ShoppingCart className="h-[17px] w-[17px]" /><span className={collapsed ? 'hidden' : ''}>Customer profile</span></button>}
        <button onClick={switchAccount} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center' : ''}`}><Users className="h-[17px] w-[17px]" /><span className={collapsed ? 'hidden' : ''}>Switch account</span></button>
        <button onClick={() => signOut({ redirectUrl: '/' })} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center' : ''}`}><LogOut className="h-[17px] w-[17px]" /><span className={collapsed ? 'hidden' : ''}>Sign out</span></button>
      </div>
    </aside>
    {open && <button className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className={`min-h-[100dvh] transition-[padding] duration-200 ${collapsed ? 'md:pl-[76px]' : 'md:pl-[272px]'}`}>
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3"><button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button><button type="button" onClick={goBack} className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground hover:text-foreground sm:inline-flex"><ArrowLeft className="h-4 w-4" />Back</button><div className="min-w-0"><p className="truncate text-sm font-bold">{active?.label ?? (admin ? 'Overview' : 'Overview')}</p><p className="hidden truncate text-[11px] text-muted-foreground sm:block">{admin ? 'Lunavo Operations' : displayName}</p></div></div>
        <div className="flex items-center gap-2 sm:gap-3"><button className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground hover:text-foreground lg:inline-flex"><CircleHelp className="h-4 w-4" />Help</button>{!admin && <button type="button" onClick={switchToCustomerProfile} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground sm:flex sm:w-auto sm:px-3 sm:gap-2"><ShoppingCart className="h-4 w-4" /><span className="hidden text-xs font-bold sm:inline">Customer</span></button>}<div className="flex items-center gap-2 border-l border-border pl-2 sm:pl-3"><div className="hidden text-right sm:block"><p className="text-xs font-bold">{user?.firstName || 'User'}</p><p className="text-[10px] text-muted-foreground">{admin ? 'Master admin' : 'Store operator'}</p></div><div className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background text-xs font-black">{initials(user?.fullName || user?.primaryEmailAddress?.emailAddress)}</div></div></div>
      </header>
      <div className="page-enter px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto w-full max-w-[1480px]">{children}</div></div>
    </main>
    <HelpBot />
  </div>;
}

export function PublicHeader() {
  const chooseMerchantProfile = () => window.localStorage.setItem('lunavo-role', 'merchant');
  return <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8"><Link href="/" data-testid="link-public-logo"><Logo /></Link><nav className="hidden items-center gap-1 md:flex"><Link href="/general-store" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">General Store</Link><Link href="/leaderboard" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Leaderboard</Link><Link href="/auctions" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Auctions</Link></nav><div className="flex items-center gap-2"><Link href="/dashboard" onClick={chooseMerchantProfile} className="hidden rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted sm:inline-flex">Merchant workspace</Link><Link href="/sign-in" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted sm:inline-flex">Sign in</Link><Link href="/sign-up" className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-sm transition hover:-translate-y-0.5">Open an account</Link></div></div></header>;
}
