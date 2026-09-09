import LunavoCommandCenter from "./pages/lunavo-command-center";
import { LunavoOperationsPage, LunavoLedgerPage } from "./pages/lunavo-commerce-operations";
import LunavoPayments from "./pages/lunavo-payments";
import LunavoSurfacePage, { FrontierLabPage } from "./pages/lunavo-surface-pages";
import LunavoAdmin from "./pages/lunavo-admin";

export const lunavoSurfaceRegistry: Record<string, any> = {
  "/dashboard": LunavoCommandCenter,
  "/orders": () => <LunavoOperationsPage area="orders" />,
  "/products": () => <LunavoOperationsPage area="products" />,
  "/inventory": () => <LunavoOperationsPage area="inventory" />,
  "/customers": () => <LunavoOperationsPage area="customers" />,
  "/payments": LunavoPayments,
  "/transactions": () => <LunavoLedgerPage title="Transactions" subtitle="A traceable record of commerce and settlement events." />,
  "/payouts": () => <LunavoLedgerPage title="Payouts" subtitle="Merchant withdrawal requests and payout lifecycle controls." />,
  "/invoices": () => <LunavoSurfacePage surface="invoices" />,
  "/refunds": () => <LunavoSurfacePage surface="refunds" />,
  "/analytics": () => <LunavoSurfacePage surface="analytics" />,
  "/marketing": () => <LunavoSurfacePage surface="marketing" />,
  "/shipping": () => <LunavoSurfacePage surface="shipping" />,
  "/taxes": () => <LunavoSurfacePage surface="taxes" />,
  "/domains": () => <LunavoSurfacePage surface="domains" />,
  "/integrations": () => <LunavoSurfacePage surface="integrations" />,
  "/developer": () => <LunavoSurfacePage surface="developer" />,
  "/store-builder": () => <LunavoSurfacePage surface="store-builder" />,
  "/themes": () => <LunavoSurfacePage surface="themes" />,
  "/marketplace": () => <LunavoSurfacePage surface="marketplace" />,
  "/digital-products": () => <LunavoSurfacePage surface="digital-products" />,
  "/courses": () => <LunavoSurfacePage surface="courses" />,
  "/memberships": () => <LunavoSurfacePage surface="memberships" />,
  "/services": () => <LunavoSurfacePage surface="services" />,
  "/bookings": () => <LunavoSurfacePage surface="bookings" />,
  "/events": () => <LunavoSurfacePage surface="events" />,
  "/subscriptions": () => <LunavoSurfacePage surface="subscriptions" />,
  "/commerce-suite": () => <LunavoSurfacePage surface="analytics" />,
  "/frontier-lab": FrontierLabPage,
  "/admin": LunavoAdmin,
};
