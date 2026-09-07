import { Router, type IRouter } from "express";
import healthRouter from "./health";
import flutterwaveWebhookRouter from "./flutterwave-webhook";
import commerceRouter from "./commerce";

const router: IRouter = Router();

router.use(healthRouter);
// Must run before commerce JSON-backed routes because app.ts preserves the raw
// webhook bytes for signature verification. Provider verification is therefore
// the only path allowed to finalize Flutterwave payments.
router.use(flutterwaveWebhookRouter);
router.use(commerceRouter);

export default router;
