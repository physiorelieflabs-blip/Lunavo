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
import PublicStorefront from '@/pages/public-storefront';
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
import PublicPaymentReturn from '@/pages/public-payment-return';
import Activity from '@/pages/activity';
import Team from '@/pages/team';
import Analytics from '@/pages/analytics';
import Settings from '@/pages/settings';
import Media from '@/pages/media';
import TsPay from '@/pages/ts-pay';
import Invite from '@/pages/invite';
import PasswordReset from '@/pages/password-reset';
import Leaderboard from '@/pages/leaderboard';
import { CustomerContextPage, InvoiceContextPage, OrderContextPage } from '@/pages/connected-record';
import { setSelectedWorkspaceId, useGetSubscription } from '@workspace/api-client-react';
import { ThemeToggle } from '@/components/theme-toggle';

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
  return <div className="studio-card mb-5 w-full max-w-[440px] rounded-[17px] p-4"><p className="studio-kicker text-center">Optional sign-in path</p><p className="mt-1 text-center text-sm font-bold text-foreground">What are you here to do?</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => choose('merchant')} className={`rounded-xl border px-3 py-3 text-left text-sm transition ${role === 'merchant' ? 'border-accent bg-[hsl(var(--accent)/.1)]' : 'border-border bg-muted hover:border-accent'}`}><span className="block font-extrabold">Run a store</span><span className="mt-1 block text-xs text-muted-foreground">Merchant workspace</span></button><button type="button" onClick={() => choose('customer')} className={`rounded-xl border px-3 py-3 text-left text-sm transition ${role === 'customer' ? 'border-accent bg-[hsl(var(--accent)/.1)]' : 'border-border bg-muted hover:border-accent'}`}><span className="block font-extrabold">Shop & bid</span><span className="mt-1 block text-xs text-muted-foreground">Customer experience</span></button></div><p className="mt-3 text-center text-[11px] text-muted-foreground">Optional — skip this and we’ll keep the standard merchant path.</p></div>;
}

function AuthPageFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return <div className="noise flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
    <div className="mb-7 text-center">
      <Link href="/" className="inline-flex" data-testid="link-auth-logo">
        <span className="font-mono text-xs font-medium tracking-[.08em] text-[#1f2b38]">TS COMMERCE PLATTFORM</span>
      </Link>
       <p className="studio-kicker mt-3 text-center">A clearer way to run your commerce</p>
    </div>
    {children}
    {footer}
  </div>;
}

function SignInPage() {
  return <AuthPageFrame footer={<p className="mt-4 max-w-[440px] text-center text-xs leading-5 text-[#697687]">
    Forgot your password? <a href={`${basePath}/sign-in/forgot-password`} className="font-extrabold text-[#b14f36] underline" data-testid="link-forgot-password">Reset it securely</a>.
  </p>}>
    <AuthRoleChooser />
    <SignIn
      routing="path"
      path={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      fallbackRedirectUrl={`${basePath}/dashboard`}
    />
  </AuthPageFrame>;
}

function SignUpPage() {
  const [details, setDetails] = useState({ firstName: '', lastName: '', username: '' });
  const [showSignUp, setShowSignUp] = useState(false);
  const [error, setError] = useState('');

  const continueToSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstName = details.firstName.trim();
    const lastName = details.lastName.trim();
    const username = details.username.trim().replace(/^@+/, '');
    if (!firstName || !lastName || !username) {
      setError('First name, last name, and username are required.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
      setError('Use 3–64 letters, numbers, dots, dashes, or underscores for your username.');
      return;
    }
    setError('');
    setDetails({ firstName, lastName, username });
    setShowSignUp(true);
  };

  return <AuthPageFrame>
    <AuthRoleChooser />
    {!showSignUp ? (
      <form onSubmit={continueToSignUp} className="w-full max-w-[440px] rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 shadow-[0_18px_38px_rgba(31,43,56,.07)] sm:p-8">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#a2772e]">Create your identity</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[#182333]">Tell us who you are</h1>
        <p className="mt-3 text-sm leading-6 text-[#697687]">First name, last name, and username are required before you create your TS Commerce account.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#182333]">First name
            <input required autoFocus value={details.firstName} onChange={(event) => setDetails((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" maxLength={64} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15" />
          </label>
          <label className="text-sm font-bold text-[#182333]">Last name
            <input required value={details.lastName} onChange={(event) => setDetails((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" maxLength={64} className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-bold text-[#182333]">Username
          <input required value={details.username} onChange={(event) => setDetails((current) => ({ ...current, username: event.target.value }))} autoComplete="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.-]{3,64}" className="mt-2 h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333] outline-none focus:border-[#b14f36] focus:ring-2 focus:ring-[#b14f36]/15" placeholder="your-name" />
          <span className="mt-1 block text-xs font-normal text-[#697687]">Use letters, numbers, dots, dashes, or underscores.</span>
        </label>
        {error && <p className="mt-4 rounded-xl bg-[#fff0ed] px-3 py-3 text-sm leading-5 text-[#943b35]" role="alert">{error}</p>}
        <button type="submit" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#182333] px-4 text-sm font-extrabold text-[#f8f3e8] transition hover:bg-[#25354a]">Continue to account creation</button>
        <p className="mt-5 text-center text-xs text-[#697687]">Already have an account? <Link href="/sign-in" className="font-extrabold text-[#b14f36] underline">Sign in</Link></p>
      </form>
    ) : (
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/dashboard`}
        initialValues={details}
      />
    )}
  </AuthPageFrame>;
}

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Landing />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return admin ? <AdminGate>{children}</AdminGate> : <SubscriptionGate>{children}</SubscriptionGate>;
}

function SubscriptionGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const subscription = useGetSubscription();
  const billingRoute = location === '/billing';

  if (billingRoute) return <>{children}</>;
  if (subscription.isLoading) {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#f7f4ed] px-6"><p className="text-sm font-bold text-[#697687]">Checking account access…</p></main>;
  }
  if (subscription.isError || !subscription.data) {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#f7f4ed] px-6"><section className="w-full max-w-xl rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-8 text-center shadow-[0_18px_38px_rgba(31,43,56,.08)]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#a33e38]">Access check unavailable</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-.06em] text-[#182333]">We could not confirm your billing status.</h1><p className="mt-3 text-sm leading-6 text-[#697687]">Open Billing to retry the account check and choose a payment method if needed.</p><Link href="/billing" className="mt-6 inline-flex rounded-xl bg-[#182333] px-5 py-3 text-sm font-extrabold text-[#f8f3e8]">Open Billing</Link></section></main>;
  }
  if (!subscription.data.accessLocked) return <>{children}</>;

  return <main className="grid min-h-[100dvh] place-items-center bg-[#182333] px-5 py-10 text-[#f8f3e8]"><section className="w-full max-w-2xl rounded-2xl border border-[#516176] bg-[#223247] p-7 shadow-[0_24px_70px_rgba(0,0,0,.25)] md:p-10"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#d6aa46]">Workspace paused</p><h1 className="mt-3 text-4xl font-extrabold tracking-[-.07em]">Choose how you want to pay.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-[#c5ced8]">Your 24-hour payment-selection window or your payment window has ended. The workspace stays locked until you choose a payment method and complete a verified payment.</p><div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[#516176] bg-[#2b3b50] p-4"><p className="font-extrabold">Dashboard</p><p className="mt-1 text-xs leading-5 text-[#b4c0cc]">Use earnings when they are available.</p></div><div className="rounded-xl border border-[#516176] bg-[#2b3b50] p-4"><p className="font-extrabold">Bank</p><p className="mt-1 text-xs leading-5 text-[#b4c0cc]">Send the exact amount and submit your reference.</p></div><div className="rounded-xl border border-[#516176] bg-[#2b3b50] p-4"><p className="font-extrabold">Retry</p><p className="mt-1 text-xs leading-5 text-[#b4c0cc]">Retry a failed payment or choose another method.</p></div></div><Link href="/billing" className="mt-8 inline-flex rounded-xl bg-[#d6aa46] px-5 py-3 text-sm font-extrabold text-[#182333]">Choose payment method</Link></section></main>;
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
        setSelectedWorkspaceId(undefined, id);
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
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/marketplace" component={Marketplace} />
    <Route path="/auctions/:id" component={Auctions} />
    <Route path="/auctions" component={Auctions} />
     <Route path="/marketplace/manage" component={() => <Protected><MarketplaceManagement /></Protected>} />
    <Route path="/auctions/manage" component={() => <Protected><AuctionManagement /></Protected>} />
       <Route path="/sign-in/forgot-password" component={PasswordReset} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
     <Route path="/checkout/payment-return" component={PublicPaymentReturn} />
      <Route path="/store/:merchantKey" component={PublicStorefront} />
     <Route path="/checkout/:merchantKey" component={Checkout} />
     <Route path="/pay/:token" component={PaymentLinkCheckout} />
     <Route path="/invoice/:token" component={PublicInvoice} />
     <Route path="/invite/:token" component={Invite} />
    <Route path="/dashboard" component={() => <Protected><Dashboard /></Protected>} />
     <Route path="/analytics" component={() => <Protected><Analytics /></Protected>} />
     <Route path="/settings" component={() => <Protected><Settings /></Protected>} />
      <Route path="/media" component={() => <Protected><Media /></Protected>} />
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
      <Route path="/ts-pay" component={() => <Protected><TsPay /></Protected>} />
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
     return <Switch><Route path="/" component={Landing} /><Route path="/general-store" component={GeneralStore} /><Route path="/leaderboard" component={Leaderboard} /><Route path="/marketplace" component={Marketplace} /><Route path="/auctions/:id" component={Auctions} /><Route path="/auctions" component={Auctions} /><Route path="/checkout/payment-return" component={PublicPaymentReturn} /><Route path="/store/:merchantKey" component={PublicStorefront} /><Route path="/checkout/:merchantKey" component={Checkout} /><Route path="/pay/:token" component={PaymentLinkCheckout} /><Route path="/invoice/:token" component={PublicInvoice} /><Route path="/sign-in/forgot-password" component={() => <AuthUnavailable mode="password reset" />} /><Route path="/sign-in/*?" component={() => <AuthUnavailable mode="sign in" />} /><Route path="/sign-up/*?" component={() => <AuthUnavailable mode="sign up" />} /><Route component={NotFound} /></Switch>;
}

 function AuthUnavailable({ mode }: { mode: string }) {
  return <main className="noise grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5"><div className="w-full max-w-md border border-[#d5cdbd] bg-[#fcfaf5] p-8 text-center shadow-[0_18px_38px_rgba(31,43,56,.07)]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#c85d3f]">TS / COMMERCE</p><h1 className="mt-4 text-2xl font-extrabold tracking-[-.05em]">Authentication is being prepared.</h1><p className="mt-3 text-sm leading-6 text-[#697687]">The {mode} service is not configured in this environment yet. Please return to the public site.</p><Link href="/" className="mt-6 inline-flex rounded-[10px] bg-[#1f2b38] px-4 py-3 text-sm font-extrabold text-[#f8f3e8]" data-testid="link-auth-unavailable-home">Return home</Link></div></main>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><Router /></WouterRouter><ThemeToggle /><Toaster /></TooltipProvider>;
}

export default App;
