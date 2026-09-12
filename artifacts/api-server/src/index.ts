import app from "./app";
import { logger } from "./lib/logger";
import { startDomainEventOutbox } from "./lib/domain-events";
import { startPendingFlutterwaveReconciliation } from "./lib/flutterwave-reconciliation";
import { startDailyAiAdvertisingPlanner } from "./lib/daily-ai-advertising-worker";
import { loadStoredFlutterwaveCredential } from "./lib/flutterwave-runtime";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

await loadStoredFlutterwaveCredential();
startDomainEventOutbox();
startPendingFlutterwaveReconciliation();
startDailyAiAdvertisingPlanner();
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
