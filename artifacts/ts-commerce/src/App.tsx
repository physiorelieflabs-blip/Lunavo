import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowRight, Banknote, LockKeyhole, Landmark } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import Billing from '@/pages/billing';
import Customers from '@/pages/customers';
import Admin from '@/pages/admin';
import AdminIntegrations from '@/pages/admin-integrations';
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
import Guide from '@/pages/guide';
import CommerceGrowth from '@/pages/commerce-growth';
import CommerceSuite from '@/pages/commerce-suite';
import AdStudio from '@/pages/ad-studio';
import SetupPage from '@/pages/setup';
import { CustomerContextPage, InvoiceContextPage, OrderContextPage } from '@/pages/connected-record';
import { setSelectedWorkspaceId, useGetSubscription } from '@workspace/api-client-react';
import { ThemeToggle } from '@/components/theme-toggle';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const ADMIN_EMAIL = 'ifeoluwaolowu4@gmail.com';

function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
function HomeRoute() { return <><Show when="signed-in"><HomeRedirect /></Show><Show when="signed-out"><Landing /></Show></>; }
function HomeRedirect() { const { user, isLoaded } = useUser(); if (!isLoaded) return <Landing />; const isAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress?.verification?.status === 'verified'; return <Redirect to={isAdmin ? '/admin' : '/dashboard'} />; }
function AuthRoleChooser() { const [role, setRole] = useState<string | null>(() => window.localStorage.getItem('lunavo-role')); const choose = (value: 'merchant' | 'customer') => { window.localStorage.setItem('lunavo-role', value); setRole(value); }; return <div className="...">...</div>; }
function AuthPageFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) { return <div className="noise flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8"><div className="w-full max-w-[440px] rounded-[28px] border border-[#d9d2c4] bg-[#fbfaf6] p-5 shadow-[0_12px_40px_rgba(24,35,51,0.08)] md:p-7">{children}</div>{footer}</div>; }
function SignInPage() { return <AuthPageFrame footer={<p className="mt-4 max-w-[440px] text-center text-xs leading-5 text-[#697687]">Forgot your password? <a href={`${basePath}/sign-in/forgot-password`} className="font-bold text-[#8a6826] underline underline-offset-4">Reset it</a></p>}><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Lunavo</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] text-[#182333]">Welcome back</h1></div><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f1e6cf] text-[#8a6826]"><LockKeyhole className="h-5 w-5" /></div></div><SignIn signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/dashboard`} /></AuthPageFrame>; }
function SignUpPage() { const [details, setDetails] = useState({ firstName: '', lastName: '', username: '' }); const [showSignUp, setShowSignUp] = useState(false); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false); const submit = async (event: React.FormEvent) => { event.preventDefault(); setSubmitting(true); setError(''); try { const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) }); if (!response.ok) throw new Error('Could not create your account'); window.location.href = `${basePath}/dashboard`; } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create account'); } finally { setSubmitting(false); } }; return <AuthPageFrame footer={<p className="mt-4 max-w-[440px] text-center text-xs leading-5 text-[#697687]">Already have an account? <a href={`${basePath}/sign-in`} className="font-bold text-[#8a6826] underline underline-offset-4">Sign in</a></p>}><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#315e6c]">Join</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] text-[#182333]">Create your merchant account</h1></div><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#dfeaf0] text-[#315e6c]"><Banknote className="h-5 w-5" /></div></div>{showSignUp ? <div className="space-y-3"><input value={details.firstName} onChange={(event) => setDetails((current) => ({ ...current, firstName: event.target.value }))} className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333]" placeholder="First name" /><input value={details.lastName} onChange={(event) => setDetails((current) => ({ ...current, lastName: event.target.value }))} className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333]" placeholder="Last name" /><input value={details.username} onChange={(event) => setDetails((current) => ({ ...current, username: event.target.value }))} className="h-11 w-full rounded-xl border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm text-[#182333]" placeholder="Username" /><button onClick={submit} disabled={submitting} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 py-3 text-sm font-extrabold text-[#f8f3e8] disabled:opacity-60">{submitting ? 'Creating account...' : 'Create account'} <ArrowRight className="h-4 w-4" /></button>{error && <p className="text-sm text-[#b14f36]">{error}</p>}</div> : <><p className="mb-4 text-sm leading-6 text-[#697687]">Lunavo is a self-hosted commerce workspace. Create an admin account to configure your payment provider and launch your storefront.</p><button onClick={() => setShowSignUp(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#182333] px-4 py-3 text-sm font-extrabold text-[#f8f3e8]">Continue <ArrowRight className="h-4 w-4" /></button></>}{!showSignUp && <div className="mt-5 text-center text-xs text-[#697687]">Instead of a full Clerk signup, you may continue with the standard account flow in the app shell.</div>}</AuthPageFrame>; }
function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) { const { isLoaded, isSignedIn } = useAuth(); if (!isLoaded) return <Landing />; if (!isSignedIn) return <Landing />; return <SetupGate>{children}</SetupGate>; }
function SetupGate({ children }: { children: ReactNode }) { const { getToken, isLoaded, isSignedIn } = useAuth(); const [, setLocation] = useLocation(); const [checking, setChecking] = useState(true); useEffect(() => { if (!isLoaded || !isSignedIn) { setChecking(false); return; } let active = true; (async () => { try { const token = await getToken(); const response = await fetch('/api/setup/status', { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); const data = await response.json().catch(() => ({})); if (!active) return; if (data.needsSetup) { setLocation('/setup'); return; } } catch { } if (active) setChecking(false); })(); return () => { active = false; }; }, [getToken, isLoaded, isSignedIn, setLocation]); if (!isLoaded || checking) return <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] text-[#182333]"><div className="text-center"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Lunavo</p><p className="mt-3 text-sm text-[#697687]">Checking setup…</p></div></main>; return <>{children}</>; }
function SubscriptionGate({ children }: { children: ReactNode }) { const [location] = useLocation(); const subscription = useGetSubscription(); const billingRoute = location === '/billing'; if (billingRoute) return <>{children}</>; if (subscription.isLoading) return <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] text-[#182333]"><div className="text-center"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Lunavo</p><p className="mt-3 text-sm text-[#697687]">Loading billing state…</p></div></main>; return <>{children}</>; }
function AdminGate({ children }: { children: ReactNode }) { const { user } = useUser(); const isAdmin = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === ADMIN_EMAIL && user.primaryEmailAddress?.verification?.status === 'verified'; if (!isAdmin) return <Landing />; return <>{children}</>; }
function ClerkQueryCacheInvalidator() { const { addListener } = useClerk(); const client = useQueryClient(); const previous = useRef<string | null | undefined>(undefined); useEffect(() => { const unsubscribe = addListener(({ user }) => { const next = user?.id ?? null; if (previous.current !== next) { previous.current = next; void client.invalidateQueries(); } }); return () => unsubscribe(); }, [addListener, client]); return null; }
function AuthRoutes() { return <Switch>
    <Route path="/" component={HomeRoute} />
    <Route path="/general-store" component={GeneralStore} />
    <Route path="/leaderboard" component={Leaderboard} />
    <Route path="/guide" component={() => <Protected><Guide /></Protected>} />
    <Route path="/marketplace" component={Marketplace} />
    <Route path="/growth" component={() => <Protected><CommerceGrowth /></Protected>} />
    <Route path="/commerce-suite" component={() => <Protected><CommerceSuite /></Protected>} />
    <Route path="/ad-studio" component={() => <Protected><AdStudio /></Protected>} />
    <Route path="/setup" component={SetupPage} />
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
    <Route path="/sourcing" component={() => <Protected><Suppliers /></Protected>} />
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
    <Route path="/admin/integrations" component={() => <Protected admin><AdminIntegrations /></Protected>} />
    <Route path="/admin/merchants" component={() => <Protected admin><Merchants /></Protected>} />
    <Route path="/admin/withdrawals" component={() => <Protected admin><AdminWithdrawals /></Protected>} />
    <Route component={NotFound} />
  </Switch>; }
function BrandedProvider() { const [, setLocation] = useLocation(); return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: 'clerk', variables: { colorPrimary: '#182333', colorBackground: '#f8f3e8', colorText: '#182333', colorInputBackground: '#ffffff', borderRadius: '0.875rem' } }}>{<AuthRoutes />}</ClerkProvider>; }
function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{clerkPubKey ? <BrandedProvider /> : <AuthRoutesWithoutClerk />}</ErrorBoundary>; }
function AuthRoutesWithoutClerk() { return <Switch><Route path="/" component={Landing} /><Route path="/general-store" component={GeneralStore} /><Route path="/leaderboard" component={Leaderboard} /><Route path="/guide" component={Guide} /><Route path="/setup" component={SetupPage} /><Route path="/store/:merchantKey" component={PublicStorefront} /><Route path="/checkout/:merchantKey" component={Checkout} /><Route path="/checkout/payment-return" component={PublicPaymentReturn} /><Route path="/pay/:token" component={PaymentLinkCheckout} /><Route path="/invoice/:token" component={PublicInvoice} /><Route path="/invite/:token" component={Invite} /><Route component={NotFound} /></Switch>; }
function AuthUnavailable({ mode }: { mode: string }) { return <main className="noise grid min-h-[100dvh] place-items-center bg-[#f5f1e8] px-5"><div className="w-full max-w-md border border-[#d5cdc0] bg-[#fbfaf6] p-7 text-center shadow-[0_10px_40px_rgba(24,35,51,0.08)]"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Lunavo</p><h1 className="mt-3 text-2xl font-extrabold text-[#182333]">{mode === 'clerk' ? 'Authentication is unavailable' : 'Account setup is unavailable'}</h1><p className="mt-3 text-sm leading-6 text-[#697687]">Please check the environment configuration and reload this page.</p></div></main>; }
function App() { return <TooltipProvider><WouterRouter base={basePath}><Router /></WouterRouter><ThemeToggle /><Toaster /></TooltipProvider>; }
export default App;
