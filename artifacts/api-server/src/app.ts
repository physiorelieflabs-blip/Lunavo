import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", /^\/(?:api\/public\/invitations|invite)(?:\/|$)/.test(req.path) ? "no-referrer" : "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        const pathname = req.url?.split("?")[0]?.replace(
          /\/public\/invitations\/[^/]+/g,
          "/public/invitations/:redacted",
        );
        return {
          id: req.id,
          method: req.method,
          url: pathname,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
// Flutterwave signs the exact JSON bytes. Capture this route before the
// general JSON parser so webhook verification cannot be bypassed by parsing
// and re-serializing the payload.
app.use("/api/webhooks/flutterwave", express.raw({ type: "application/json", limit: "256kb" }));
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const statusCode = error && typeof error === "object" && "statusCode" in error && (error as { statusCode?: unknown }).statusCode === 403 ? 403 : 500;
  if (statusCode === 403) req.log.warn({ err: error }, "Merchant authorization denied");
  else req.log.error({ err: error }, "Unhandled request error");
  res.status(statusCode).json({ error: statusCode === 403 ? "You do not have permission for this action" : "Internal server error" });
});

export default app;
