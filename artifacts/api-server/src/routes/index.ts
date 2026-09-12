import { Router, type IRouter } from "express";
import healthRouter from "./health";
import paymentBoundaryRouter from "./payment-boundary";
import flutterwaveWebhookRouter from "./flutterwave-webhook";
import adminIntegrationsRouter from "./admin-integrations";
import marketplacePlatformRouter from "./marketplace-platform";
import marketplaceLegacyGuardRouter from "./marketplace-legacy-guard";
import marketplaceAdvertisingCompatRouter from "./marketplace-advertising-compat";
import auctionIntegrityRouter from "./auction-integrity";
import merchantControlPlaneRouter from "./merchant-control-plane";
import commerceRouter from "./commerce";
import commerceGrowthRouter from "./commerce-growth";
import commerceSuiteRouter from "./commerce-suite";
import adStudioStitchRouter from "./ad-studio-stitch";
import adStudioRouter from "./ad-studio";
import socialHubRouter from "./social-hub";
import subscriptionOptionsRouter from "./subscription-options";
import storefrontDomainsRouter from "./storefront-domains";
import storefrontPublishingRouter from "./storefront-publishing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(paymentBoundaryRouter);
router.use(flutterwaveWebhookRouter);
router.use(adminIntegrationsRouter);
router.use(marketplacePlatformRouter);
router.use(marketplaceLegacyGuardRouter);
router.use(marketplaceAdvertisingCompatRouter);
// Public auction writes must pass the concurrency/risk gate before legacy commerce routes.
router.use(auctionIntegrityRouter);
// Merchant automation, abuse checks and store-auction eligibility are server-authoritative.
router.use(merchantControlPlaneRouter);
router.use(commerceRouter);
router.use(commerceGrowthRouter);
router.use(commerceSuiteRouter);
router.use(adStudioStitchRouter);
router.use(adStudioRouter);
router.use(socialHubRouter);
router.use(subscriptionOptionsRouter);
router.use(storefrontDomainsRouter);
router.use(storefrontPublishingRouter);

export default router;
