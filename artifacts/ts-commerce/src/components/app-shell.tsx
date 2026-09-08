import { type ReactNode, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCurrentWorkspaceQueryKey, getListAccessibleWorkspacesQueryKey, getListMerchantsQueryKey, getSelectedWorkspaceId, setSelectedWorkspaceId, useGetCurrentWorkspace, useListAccessibleWorkspaces, useListMerchants } from '@workspace/api-client-react';
import { useClerk, useUser } from '@clerk/react';
import { ArrowLeft, BarChart3, BrainCircuit, Building2, ChevronRight, CreditCard, Globe2, Gavel, ImagePlus, Landmark, LayoutDashboard, LineChart, LogOut, Menu, PackageCheck, Route, Settings2, ShieldCheck, Store, Users, UsersRound, Warehouse, X, WalletCards, ShoppingCart, Megaphone, FileText, Bell } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { ErrorState, LoadingState, Logo } from '@/components/primitives';
import { HelpBot } from '@/components/help-bot';
import { initials } from '@/lib/format';

export { Logo };

const merchantLinks = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/store', label: 'Storefront builder', icon: Store },
  { href: '/ai', label: 'AI control room', icon: BrainCircuit },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/general-store', label: 'General Store', icon: Globe2 },
  { href: '/marketplace/manage', label: 'Marketplace', icon: Globe2 },
  { href: '/auctions/manage', label: 'Auctions', icon: Gavel },
  { href: '/orders', label: 'Orders', icon: PackageCheck },
  { href: '/pos', label: 'TS POS', icon: ShoppingCart },
  { href: '/customers', label: 'Customers', icon: UsersRound },
  { href: '/dropshipping', label: 'Supplier fulfillment', icon: Route },
  { href: '/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
  { href: '/suppliers', label: 'Suppliers', icon: Store },
  { href: '/inventory', label: 'Inventory', icon: Warehouse },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/finance', label: 'Finance', icon: WalletCards },
  { href: '/ts-pay', label: 'TS Pay', icon: Landmark },
   { href: '/invoices', label: 'Invoices', icon: FileText },
   { href: '/activity', label: 'Notifications & activity', icon: Bell },
   { href: '/team', label: 'Team & locations', icon: Users },
   { href: '/media', label: 'Picture library', icon: ImagePlus },
   { href: '/settings', label: 'Settings', icon: Settings2 },
];

const adminLinks = [
  { href: '/admin', label: 'Control room', icon: BarChart3 },
  { href: '/admin/merchants', label: 'Merchants', icon: Users },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ShieldCheck },
];
const ADMIN_EMAIL = 'ifeoluwaolowu4@gmail.com';

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(() => getSelectedWorkspaceId());
  const isMasterAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress.verification?.status === 'verified';
  const adminMerchants = useListMerchants({ query: { queryKey: getListMerchantsQueryKey(), enabled: admin && isLoaded && !!user, retry: false, staleTime: 60_000 } });
  const workspaces = useListAccessibleWorkspaces({ query: { queryKey: getListAccessibleWorkspacesQueryKey(), enabled: !admin && !isMasterAdmin && isLoaded && !!user, retry: false, staleTime: 60_000 } });
  const currentWorkspace = useGetCurrentWorkspace({ query: { queryKey: getGetCurrentWorkspaceQueryKey(), enabled: !admin && isLoaded && !!user && ((isMasterAdmin && Boolean(selectedWorkspace)) || (!isMasterAdmin && workspaces.isFetched && (Boolean(selectedWorkspace) || workspaces.data?.length === 0))), retry: false, staleTime: 60_000 } });
  const isAdminPreview = isMasterAdmin && !admin && Boolean(selectedWorkspace);
  useEffect(() => {
    if (!isLoaded) return;
    setSelectedWorkspaceId(undefined, user?.id ?? null);
    const nextSelected = getSelectedWorkspaceId();
    setSelectedWorkspace(nextSelected);
    queryClient.clear();
  }, [isLoaded, user?.id, queryClient]);
  useEffect(() => {
    if (admin || isMasterAdmin || !workspaces.data?.length) return;
    const available = new Set(workspaces.data.map((workspace) => String(workspace.id)));
    const nextSelected = selectedWorkspace && available.has(selectedWorkspace)
      ? selectedWorkspace
      : String(workspaces.data[0]!.id);
    if (nextSelected !== selectedWorkspace) {
      setSelectedWorkspace(nextSelected);
      setSelectedWorkspaceId(nextSelected);
      queryClient.clear();
    }
  }, [admin, isMasterAdmin, queryClient, selectedWorkspace, workspaces.data]);
  useEffect(() => {
    if (currentWorkspace.data?.id == null) return;
    const nextSelected = String(currentWorkspace.data.id);
    if (nextSelected !== selectedWorkspace) {
      setSelectedWorkspace(nextSelected);
      setSelectedWorkspaceId(nextSelected);
    }
  }, [currentWorkspace.data?.id, selectedWorkspace]);
  const links = admin ? adminLinks : merchantLinks;
  const displayName = admin ? 'TS / OPERATIONS' : currentWorkspace.data?.storeName || user?.fullName || 'Your workspace';
  const switchWorkspace = (merchantId: number) => {
    if (merchantId === currentWorkspace.data?.id) return;
    setSelectedWorkspace(String(merchantId));
    setSelectedWorkspaceId(merchantId);
    queryClient.clear();
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    setLocation('/dashboard');
  };
  const switchToMerchant = (merchantId: number) => {
    setSelectedWorkspace(String(merchantId));
    setSelectedWorkspaceId(merchantId);
    queryClient.clear();
    setLocation('/dashboard');
  };
  const returnToAdmin = () => {
    setSelectedWorkspace(null);
    setSelectedWorkspaceId(null);
    queryClient.clear();
    setLocation('/admin');
  };
  const switchAccount = () => {
    setSelectedWorkspaceId(null);
    queryClient.clear();
    void signOut({ redirectUrl: '/sign-in' });
  };
  const switchToCustomerProfile = () => {
    window.localStorage.setItem('ts-commerce-role', 'customer');
    queryClient.clear();
    setLocation('/general-store');
  };
  const activeLink = [...links]
    .sort((a, b) => b.href.length - a.href.length)
    .find((link) => location === link.href || location.startsWith(`${link.href}/`));
  const activeLabel = activeLink?.label ?? (admin ? 'Control room' : 'Overview');
  const goBack = () => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
      window.history.back();
    } else {
      setLocation(admin ? '/admin' : '/dashboard');
    }
  };

  if (!isLoaded || (!admin && !isMasterAdmin && !workspaces.isFetched) || (!admin && isMasterAdmin && Boolean(selectedWorkspace) && !currentWorkspace.isFetched)) {
    return <div className="min-h-[100dvh] bg-background p-6 md:pl-[312px] md:pt-10"><LoadingState label="Loading workspace" /></div>;
  }
  if (!admin && workspaces.isError) {
    return <div className="min-h-[100dvh] bg-background p-6 md:pl-[312px] md:pt-10"><ErrorState onRetry={() => { void workspaces.refetch(); }} /></div>;
  }
  if (!admin && currentWorkspace.isError) {
    return <div className="min-h-[100dvh] bg-background p-6 md:pl-[312px] md:pt-10"><ErrorState onRetry={() => { void currentWorkspace.refetch(); }} /></div>;
  }
  if (!admin && (!currentWorkspace.isFetched || !currentWorkspace.data)) {
    return <div className="min-h-[100dvh] bg-background p-6 md:pl-[312px] md:pt-10"><LoadingState label="Opening workspace" /></div>;
  }

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside className={`studio-sidebar fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col px-5 py-6 text-sidebar-foreground shadow-[16px_0_40px_rgba(24,35,51,.12)] transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-1">
          <Logo inverse />
          <button className="grid h-9 w-9 place-items-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-close-menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="studio-sidebar-panel mt-12 rounded-[14px] px-4 py-3.5" data-testid="panel-workspace">
          <p className="studio-nav-label">{admin ? 'Master admin' : 'Merchant workspace'}</p>
          <p className="mt-2 truncate text-sm font-bold text-sidebar-foreground" title={displayName}>{displayName}</p>
            {admin && <select aria-label="Switch merchant account" defaultValue="" onChange={(event) => switchToMerchant(Number(event.target.value))} className="mt-3 w-full rounded-lg bg-sidebar px-2 py-1.5 text-xs font-bold text-sidebar-foreground ring-1 ring-sidebar-border"><option value="">Switch merchant account</option>{adminMerchants.data?.filter((merchant) => merchant.email.toLowerCase() !== ADMIN_EMAIL).map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.storeName} · {merchant.email}</option>)}</select>}
            {!admin && !isMasterAdmin && (workspaces.data?.length ?? 0) > 1 && <select aria-label="Switch workspace" value={currentWorkspace.data?.id ?? ''} onChange={(event) => switchWorkspace(Number(event.target.value))} className="mt-3 w-full rounded-lg bg-sidebar px-2 py-1.5 text-xs font-bold text-sidebar-foreground ring-1 ring-sidebar-border"><option value="" disabled>Choose workspace</option>{workspaces.data?.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.storeName}</option>)}</select>}
            {isAdminPreview && <p className="mt-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#f0c57a]">Admin preview</p>}
           <div className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#8cc1a8]"><span className="h-1.5 w-1.5 rounded-full bg-[#8cc1a8]" />Live workspace</div>
        </div>
        <nav className="nav-scrollbar mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1" aria-label="Main navigation">
           <p className="studio-nav-label mb-3 px-3">Navigate</p>
          {links.map(({ href, label, icon: Icon }) => {
            const active = location === href;
             return <Link href={href} key={href} onClick={() => setOpen(false)} data-active={active} className={`studio-sidebar-link group relative flex items-center gap-3 rounded-[10px] px-3 py-3 text-[13px] font-bold`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon className="h-[17px] w-[17px]" /><span className="flex-1">{label}</span>{active && <ChevronRight className="h-4 w-4" />}</Link>;
          })}
        </nav>
          <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
            {isAdminPreview && <button className="studio-sidebar-link flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[13px] font-bold" onClick={returnToAdmin} data-testid="button-return-to-admin"><ArrowLeft className="h-[17px] w-[17px]" />Return to admin</button>}
           <Link href="/" className="studio-sidebar-link flex items-center gap-3 rounded-[10px] px-3 py-3 text-[13px] font-bold" data-testid="link-home"><Building2 className="h-[17px] w-[17px]" />Public site</Link>
            <button className="studio-sidebar-link flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[13px] font-bold" onClick={switchAccount} data-testid="button-switch-account"><Users className="h-[17px] w-[17px]" />Switch account</button>
           <button className="studio-sidebar-link flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[13px] font-bold" onClick={() => signOut({ redirectUrl: '/' })} data-testid="button-sign-out"><LogOut className="h-[17px] w-[17px]" />Sign out</button>
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-[#182333]/55 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-overlay" />}
       <main className="min-h-[100dvh] md:pl-[272px]">
         <header className="studio-header sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border px-5 md:px-10">
          <div className="flex items-center gap-3">
             <button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-3 md:flex">
               <button type="button" onClick={goBack} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-extrabold text-muted-foreground transition hover:border-accent hover:text-foreground" data-testid="button-back"><ArrowLeft className="h-4 w-4" />Back</button>
               <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_hsl(var(--accent)/.12)]" />Authenticated workspace <span className="mx-1 text-muted-foreground/50">/</span> {activeLabel}</div>
            </div>
             <button type="button" onClick={goBack} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card hover:bg-muted md:hidden" aria-label="Back" data-testid="button-back-mobile"><ArrowLeft className="h-5 w-5" /></button>
             <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground md:hidden">{activeLabel}</p>
          </div>
          <div className="flex items-center gap-3">
             {!admin && <button type="button" onClick={switchToCustomerProfile} className="inline-flex rounded-lg border border-border bg-card px-2 py-2 text-xs font-extrabold text-muted-foreground transition hover:border-accent hover:text-foreground sm:px-3" data-testid="button-switch-customer-profile"><ShoppingCart className="h-3.5 w-3.5 sm:mr-2" /><span className="hidden sm:inline">Customer profile</span></button>}
             <div className="hidden border-l border-border pl-4 text-right sm:block"><p className="text-xs font-extrabold">{user?.firstName || 'Merchant'}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{admin ? 'Administrator' : 'Store operator'}</p></div>
             <div className="studio-avatar grid h-10 w-10 place-items-center rounded-full border-2 border-card font-mono text-xs font-bold" data-testid="text-user-avatar">{initials(user?.fullName || user?.primaryEmailAddress?.emailAddress)}</div>
          </div>
        </header>
        <div className="page-enter px-5 py-8 md:px-10 md:py-10">{children}</div>
      </main>
      <HelpBot />
    </div>
  );
}

export function PublicHeader() {
  const chooseMerchantProfile = () => {
    window.localStorage.setItem('ts-commerce-role', 'merchant');
  };
  return <header className="studio-header sticky top-0 z-30 flex items-center justify-between border-b border-border px-5 py-4 md:px-10"><Link href="/" data-testid="link-public-logo"><Logo /></Link><div className="flex items-center gap-1.5"><Link href="/general-store" className="hidden rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted sm:inline-flex" data-testid="link-general-store">General Store</Link><Link href="/leaderboard" className="hidden rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted md:inline-flex">Leaderboard</Link><Link href="/auctions" className="hidden rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted md:inline-flex" data-testid="link-auctions">Auctions</Link><Link href="/dashboard" onClick={chooseMerchantProfile} className="rounded-lg px-3 py-2 text-sm font-extrabold text-muted-foreground hover:bg-muted" data-testid="link-merchant-workspace">Merchant workspace</Link><Link href="/sign-in" className="hidden rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted sm:inline-flex" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-[11px] bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-foreground shadow-[0_8px_18px_hsl(var(--accent)/.2)] transition hover:-translate-y-0.5 hover:bg-[hsl(14_63%_47%)]" data-testid="link-sign-up">Open an account</Link></div></header>;
}