import { Router, type IRouter } from "express";
import healthRouter from "./health";
import paymentBoundaryRouter from "./payment-boundary";
import flutterwaveWebhookRouter from "./flutterwave-webhook";
import adminIntegrationsRouter from "./admin-integrations";
import marketplacePlatformRouter from "./marketplace-platform";
import marketplaceLegacyGuardRouter from "./marketplace-legacy-guard";
import marketplaceAdvertisingCompatRouter from "./marketplace-advertising-compat";
import commerceRouter from "./commerce";
import commerceGrowthRouter from "./commerce-growth";
import commerceSuiteRouter from "./commerce-suite";
import adStudioStitchRouter from "./ad-studio-stitch";
import adStudioRouter from "./ad-studio";
import socialHubRouter from "./social-hub";
import subscriptionOptionsRouter from "./subscription-options";
import publicHostStoreRouter from "./public-host-store";

const router: IRouter = Router();

router.use(healthRouter);
router.use(paymentBoundaryRouter);
router.use(flutterwaveWebhookRouter);
router.use(adminIntegrationsRouter);
router.use(marketplacePlatformRouter);
router.use(marketplaceLegacyGuardRouter);
router.use(marketplaceAdvertisingCompatRouter);
router.use(commerceRouter);
router.use(commerceGrowthRouter);
router.use(commerceSuiteRouter);
router.use(adStudioStitchRouter);
router.use(adStudioRouter);
router.use(socialHubRouter);
router.use(subscriptionOptionsRouter);
router.use(publicHostStoreRouter);

export default router;
