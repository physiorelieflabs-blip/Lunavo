import { Router, type IRouter } from "express";
import healthRouter from "./health";
import paymentBoundaryRouter from "./payment-boundary";
import flutterwaveWebhookRouter from "./flutterwave-webhook";
import commerceRouter from "./commerce";
import commerceGrowthRouter from "./commerce-growth";

const router: IRouter = Router();

router.use(healthRouter);
// Provider-backed verification and internal earnings application must run
// before the legacy commerce handlers so frontend claims can never create
// provider payment success or bypass the partial-earnings rules.
router.use(paymentBoundaryRouter);
router.use(flutterwaveWebhookRouter);
router.use(commerceRouter);
router.use(commerceGrowthRouter);

export default router;
