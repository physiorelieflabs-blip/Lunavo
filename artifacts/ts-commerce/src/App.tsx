import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import Billing from '@/pages/billing';
import Customers from '@/pages/customers';
import Admin from '@/pages/admin';
import Merchants from '@/pages/merchants';
import NotFound from '@/pages/not-found';
import Orders from '@/pages/orders';
import Withdrawals from '@/pages/withdrawals';
import Suppliers from '@/pages/suppliers';
import AdminWithdrawals from '@/pages/admin-withdrawals';
import Dropshipping from '@/pages/dropshipping';
import Checkout from '@/pages/checkout';
import AiControlRoom from '@/pages/ai';
import Finance from '@/pages/finance';
import Inventory from '@/pages/inventory';
import StorePage from '@/pages/store';
import Pos from '@/pages/pos';
import Marketing from '@/pages/marketing';
import Marketplace from '@/pages/marketplace';
import GeneralStore from '@/pages/general-store';
import PaymentLinkCheckout from '@/pages/payment-link-checkout';
import MarketplaceManagement from '@/pages/marketplace-management';
import Auctions from '@/pages/auctions';
import AuctionManagement from '@/pages/auction-management';
import Invoices from '@/pages/invoices';
import PublicInvoice from '@/pages/invoice-public';
import Activity from '@/pages/activity';
import Team from '@/pages/team';
import Invite from '@/pages/invite';
import { CustomerContextPage, InvoiceContextPage, OrderContextPage } from '@/pages/connected-record';
import { setSelectedWorkspaceId } from '@workspace/api-client-react';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const ADMIN_EMAIL = 'ifeoluwaolowu4@gmail.com';

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function HomeRoute() {
  return <><Show when="signed-in"><HomeRedirect /></Show><Show when="signed-out"><Landing /></Show></>;
}

function HomeRedirect() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <Landing />;
  const isAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress.verification?.status === 'verified';
  const preferredRole = window.localStorage.getItem('ts-commerce-role');
  return <Redirect to={isAdmin ? '/admin' : preferredRole === 'customer' ? '/general-store' : '/dashboard'} />;
}

function AuthRoleChooser() {
  const [role, setRole] = useState<string | null>(() => window.localStorage.getItem('ts-commerce-role'));
  const choose = (value: 'merchant' | 'customer') => {
    window.localStorage.setItem('ts-commerce-role', value);
    setRole(value);
  };
  return <div className="mb-5 w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-4 shadow-[0_10px_25px_rgba(31,39,48,.04)]"><p className="text-center text-[10px] font-extrabold uppercase tracking-[.14em] text-[#a2772e]">Optional sign-in path</p><p className="mt-1 text-center text-sm font-bold text-[#182333]">What are you here to do?</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => choose('merchant')} className={`rounded-xl border px-3 py-3 text-left text-sm transition ${role === 'merchant' ? 'border-[#c85d3f] bg-[#fae8df]' : 'border-[#d9d2c4] bg-[#f7f4ed] hover:border-[#c85d3f]'}`}><span className="block font-extrabold">Run a store</span><span className="mt-1 block text-xs text-[#697687]">Merchant workspace</span></button><button type="button" onClick={() => choose('customer')} className={`rounded-xl border px-3 py-3 text-left text-sm transition ${role === 'customer' ? 'border-[#c85d3f] bg-[#fae8df]' : 'border-[#d9d2c4] bg-[#f7f4ed] hover:border-[#c85d3f]'}`}><span className="block font-extrabold">Shop & bid</span><span className="mt-1 block text-xs text-[#697687]">Customer experience</span></button></div><p className="mt-3 text-center text-[11px] text-[#697687]">Optional — skip this and we’ll keep the standard merchant path.</p></div>;
}

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Landing />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return admin ? <AdminGate>{children}</AdminGate> : <>{children}</>;
}

function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const isAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress.verification?.status === 'verified';
  return isAdmin ? <>{children}</> : <Redirect to="/dashboard" />;
}

function ClerkQueryCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (previous.current !== undefined && previous.current !== id) {
        client.clear();
        setSelectedWorkspaceId(null);
      }
      previous.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function AuthRoutes() {
  return <Switch>
    <Route path="/" component={HomeRoute} />
        <Route path="/general-store" component={GeneralStore} />
        <Route path="/marketplace" component={Marketplace} />
    <Route path="/auctions/:id" component={Auctions} />
    <Route path="/auctions" component={Auctions} />
     <Route path="/marketplace/manage" component={() => <Protected><MarketplaceManagement /></Protected>} />
    <Route path="/auctions/manage" component={() => <Protected><AuctionManagement /></Protected>} />
     <Route path="/sign-in/*?" component={() => <div className="noise flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5f1e8] px-4 py-8"><div className="mb-7 text-center"><Link href="/" className="inline-flex" data-testid="link-auth-sign-in-logo"><span className="font-mono text-xs font-medium tracking-[.08em] text-[#1f2b38]">TS / COMMERCE</span></Link><p className="mt-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#c85d3f]">A clearer way to run your commerce</p></div><AuthRoleChooser /><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /><p className="mt-4 max-w-[440px] text-center text-xs leading-5 text-[#697687]">Forgot your password? <Link href="/sign-in/forgot-password" className="font-extrabold text-[#b14f36] underline" data-testid="link-forgot-password">Reset it securely</Link>.</p></div>} />
     <Route path="/sign-up/*?" component={() => <div className="noise flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5f1e8] px-4 py-8"><div className="mb-7 text-center"><Link href="/" className="inline-flex" data-testid="link-auth-sign-up-logo"><span className="font-mono text-xs font-medium tracking-[.08em] text-[#1f2b38]">TS / COMMERCE</span></Link><p className="mt-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#c85d3f]">Commerce, kept clear</p></div><AuthRoleChooser /><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>} />
    <Route path="/checkout/:merchantKey" component={Checkout} />
     <Route path="/pay/:token" component={PaymentLinkCheckout} />
     <Route path="/invoice/:token" component={PublicInvoice} />
     <Route path="/invite/:token" component={Invite} />
    <Route path="/dashboard" component={() => <Protected><Dashboard /></Protected>} />
     <Route path="/orders/:id" component={() => <Protected><OrderContextPage /></Protected>} />
    <Route path="/orders" component={() => <Protected><Orders /></Protected>} />
     <Route path="/activity" component={() => <Protected><Activity /></Protected>} />
     <Route path="/customers/:id" component={() => <Protected><CustomerContextPage /></Protected>} />
     <Route path="/customers" component={() => <Protected><Customers /></Protected>} />
    <Route path="/withdrawals" component={() => <Protected><Withdrawals /></Protected>} />
    <Route path="/suppliers" component={() => <Protected><Suppliers /></Protected>} />
    <Route path="/dropshipping" component={() => <Protected><Dropshipping /></Protected>} />
    <Route path="/billing" component={() => <Protected><Billing /></Protected>} />
     <Route path="/finance" component={() => <Protected><Finance /></Protected>} />
      <Route path="/invoices/:id" component={() => <Protected><InvoiceContextPage /></Protected>} />
      <Route path="/invoices" component={() => <Protected><Invoices /></Protected>} />
      <Route path="/inventory" component={() => <Protected><Inventory /></Protected>} />
     <Route path="/store" component={() => <Protected><StorePage /></Protected>} />
     <Route path="/pos" component={() => <Protected><Pos /></Protected>} />
     <Route path="/marketing" component={() => <Protected><Marketing /></Protected>} />
     <Route path="/ai" component={() => <Protected><AiControlRoom /></Protected>} />
     <Route path="/team" component={() => <Protected><Team /></Protected>} />
    <Route path="/admin" component={() => <Protected admin><Admin /></Protected>} />
    <Route path="/admin/merchants" component={() => <Protected admin><Merchants /></Protected>} />
    <Route path="/admin/withdrawals" component={() => <Protected admin><AdminWithdrawals /></Protected>} />
    <Route component={NotFound} />
  </Switch>;
}

function BrandedProvider() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: 'clerk', options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: '#182333', colorForeground: '#182333', colorMutedForeground: '#697687', colorBackground: '#fbfaf6', colorInput: '#f7f4ed', colorInputForeground: '#182333', colorDanger: '#a33e38', colorNeutral: '#d9d2c4', fontFamily: 'Manrope, sans-serif', borderRadius: '0.75rem' }, elements: { rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d9d2c4]', card: '!shadow-none !border-0 !bg-transparent', footer: '!shadow-none !border-0 !bg-transparent', headerTitle: 'text-[#182333] font-extrabold', headerSubtitle: 'text-[#697687]', socialButtonsBlockButtonText: 'text-[#182333] font-bold', formFieldLabel: 'text-[#182333] font-bold', footerActionLink: 'text-[#8a6826] font-bold', footerActionText: 'text-[#697687]', dividerText: 'text-[#697687]', formButtonPrimary: 'bg-[#182333] text-[#f8f3e8] hover:bg-[#25354a]', formFieldInput: 'bg-[#f7f4ed] border-[#d9d2c4] text-[#182333]', footerAction: 'text-[#697687]', dividerLine: 'bg-[#d9d2c4]', alert: 'bg-[#fff3f0]', alertText: 'text-[#943b35]' } }} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Your ledger is waiting.' } }, signUp: { start: { title: 'Open your workspace', subtitle: 'A clearer way to run your commerce.' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkQueryCacheInvalidator /><AuthRoutes /></QueryClientProvider></ClerkProvider>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{clerkPubKey ? <BrandedProvider /> : <AuthRoutesWithoutClerk />}</ErrorBoundary>;
}

function AuthRoutesWithoutClerk() {
   return <Switch><Route path="/" component={Landing} /><Route path="/general-store" component={GeneralStore} /><Route path="/marketplace" component={Marketplace} /><Route path="/auctions/:id" component={Auctions} /><Route path="/auctions" component={Auctions} /><Route path="/checkout/:merchantKey" component={Checkout} /><Route path="/pay/:token" component={PaymentLinkCheckout} /><Route path="/invoice/:token" component={PublicInvoice} /><Route path="/sign-in/*?" component={() => <AuthUnavailable mode="sign in" />} /><Route path="/sign-up/*?" component={() => <AuthUnavailable mode="sign up" />} /><Route component={NotFound} /></Switch>;
}

 function AuthUnavailable({ mode }: { mode: string }) {
  return <main className="noise grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5"><div className="w-full max-w-md border border-[#d5cdbd] bg-[#fcfaf5] p-8 text-center shadow-[0_18px_38px_rgba(31,43,56,.07)]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#c85d3f]">TS / COMMERCE</p><h1 className="mt-4 text-2xl font-extrabold tracking-[-.05em]">Authentication is being prepared.</h1><p className="mt-3 text-sm leading-6 text-[#697687]">The {mode} service is not configured in this environment yet. Please return to the public site.</p><Link href="/" className="mt-6 inline-flex rounded-[10px] bg-[#1f2b38] px-4 py-3 text-sm font-extrabold text-[#f8f3e8]" data-testid="link-auth-unavailable-home">Return home</Link></div></main>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><Router /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;
