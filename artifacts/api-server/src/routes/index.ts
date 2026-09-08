import { Router, type IRouter } from "express";
import healthRouter from "./health";
import paymentBoundaryRouter from "./payment-boundary";
import flutterwaveWebhookRouter from "./flutterwave-webhook";
import marketplacePlatformRouter from "./marketplace-platform";
import commerceRouter from "./commerce";
import commerceGrowthRouter from "./commerce-growth";
import commerceSuiteRouter from "./commerce-suite";
import adStudioStitchRouter from "./ad-studio-stitch";
import adStudioRouter from "./ad-studio";
import socialHubRouter from "./social-hub";
import subscriptionOptionsRouter from "./subscription-options";

const router: IRouter = Router();

router.use(healthRouter);
router.use(paymentBoundaryRouter);
router.use(flutterwaveWebhookRouter);
// Put shopper discovery ahead of the legacy commerce marketplace endpoint so
// public discovery can never accidentally bypass the paid-ad eligibility gate.
router.use(marketplacePlatformRouter);
router.use(commerceRouter);
router.use(commerceGrowthRouter);
router.use(commerceSuiteRouter);
router.use(adStudioStitchRouter);
router.use(adStudioRouter);
router.use(socialHubRouter);
router.use(subscriptionOptionsRouter);

export default router;
