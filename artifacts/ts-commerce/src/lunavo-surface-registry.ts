import React from "react";
import LunavoCommandCenter from "./pages/lunavo-command-center";
import { LunavoOperationsPage, LunavoLedgerPage } from "./pages/lunavo-commerce-operations";
import LunavoPayments from "./pages/lunavo-payments";
import LunavoSurfacePage, { FrontierLabPage } from "./pages/lunavo-surface-pages";
import LunavoAdmin from "./pages/lunavo-admin";

const surface = (area: any) => React.createElement(LunavoSurfacePage, { surface: area });
const operations = (area: any) => React.createElement(LunavoOperationsPage, { area });
const ledger = (title: string, subtitle: string) => React.createElement(LunavoLedgerPage, { title, subtitle });

export const lunavoSurfaceRegistry: Record<string, any> = {
  "/dashboard": LunavoCommandCenter,
  "/orders": () => operations("orders"),
  "/products": () => operations("products"),
  "/inventory": () => operations("inventory"),
  "/customers": () => operations("customers"),
  "/payments": LunavoPayments,
  "/transactions": () => ledger("Transactions", "A traceable record of commerce and settlement events."),
  "/payouts": () => ledger("Payouts", "Merchant withdrawal requests and payout lifecycle controls."),
  "/invoices": () => surface("invoices"),
  "/refunds": () => surface("refunds"),
  "/analytics": () => surface("analytics"),
  "/marketing": () => surface("marketing"),
  "/shipping": () => surface("shipping"),
  "/taxes": () => surface("taxes"),
  "/domains": () => surface("domains"),
  "/integrations": () => surface("integrations"),
  "/developer": () => surface("developer"),
  "/store-builder": () => surface("store-builder"),
  "/themes": () => surface("themes"),
  "/marketplace": () => surface("marketplace"),
  "/digital-products": () => surface("digital-products"),
  "/courses": () => surface("courses"),
  "/memberships": () => surface("memberships"),
  "/services": () => surface("services"),
  "/bookings": () => surface("bookings"),
  "/events": () => surface("events"),
  "/subscriptions": () => surface("subscriptions"),
  "/commerce-suite": () => surface("analytics"),
  "/frontier-lab": FrontierLabPage,
  "/admin": LunavoAdmin,
};
