import { Router } from "express";
import { LUNAVO_CAPABILITIES, LUNAVO_DOMAIN_EVENTS, getCapabilitiesByDomain } from "../lib/lunavo-capabilities";

const router = Router();

// Read-only discovery endpoint used by the redesigned frontend and admin tooling.
// It describes how modules connect; it does not grant access to tenant data.
router.get("/api/capabilities", (_req, res) => {
  res.json({
    ok: true,
    architecture: "connected-commerce-os",
    selfHostedByDefault: true,
    moneyRailOnlyExternal: true,
    capabilities: LUNAVO_CAPABILITIES,
    domainEvents: LUNAVO_DOMAIN_EVENTS,
  });
});

router.get("/api/capabilities/:domain", (req, res) => {
  const capabilities = getCapabilitiesByDomain(req.params.domain as Parameters<typeof getCapabilitiesByDomain>[0]);
  if (!capabilities.length) {
    return res.status(404).json({ ok: false, error: "Unknown capability domain" });
  }
  return res.json({ ok: true, domain: req.params.domain, capabilities });
});

export default router;
