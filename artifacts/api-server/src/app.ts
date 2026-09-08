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
app.set('trust proxy', 1);
const rateBuckets = new Map<string, { windowStartedAt: number; count: number }>();
function rateLimit(prefix: string, limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const forwarded = req.headers["x-forwarded-for"];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    const ip = (firstForwarded || req.ip || "unknown").trim();
    const key = prefix + ":" + ip;
    const now = Date.now();
    const current = rateBuckets.get(key);
    if (!current || now - current.windowStartedAt >= windowMs) {
      rateBuckets.set(key, { windowStartedAt: now, count: 1 }); next(); return;
    }
    current.count += 1;
    if (current.count > limit) { res.setHeader("Retry-After", String(Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000))); res.status(429).json({ error: "Too many requests. Please try again shortly." }); return; }
    next();
  };
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of rateBuckets) if (value.windowStartedAt < cutoff) rateBuckets.delete(key);
}, 5 * 60 * 1000).unref();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", /^\/(?:api\/public\/invitations|invite)(?:\/|$)/.test(req.path) ? "no-referrer" : "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(pinoHttp({ logger, serializers: { req(req) { const pathname = req.url?.split("?")[0]?.replace(/\/public\/invitations\/[^/]+/g,"/public/invitations/:redacted"); return { id:req.id, method:req.method, url:pathname }; }, res(res) { return { statusCode:res.statusCode }; } } }));
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(clerkMiddleware((req) => ({ publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY) })));
app.use("/api/webhooks/flutterwave", express.raw({ type: "application/json", limit: "256kb" }));
app.use("/api/media", express.json({ limit: "8mb" }));
app.use("/api/ads/media", express.json({ limit: "36mb" }));
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
app.use("/api/public/checkout", rateLimit("public-checkout", 30, 60_000));
app.use("/api/ads/generator", rateLimit("ad-generator", 6, 60_000));
app.use("/api/ai/generate-image", rateLimit("image-generator", 8, 60_000));
app.use("/api/ads/media", rateLimit("ad-media-upload", 10, 60_000));
app.use("/api", router);
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => { if (res.headersSent) { next(error); return; } const statusCode=error&&typeof error==='object'&&'statusCode' in error&&(error as {statusCode?:unknown}).statusCode===403?403:500; if(statusCode===403)req.log.warn({err:error},"Merchant authorization denied");else req.log.error({err:error},"Unhandled request error"); res.status(statusCode).json({error:statusCode===403?"You do not have permission for this action":"Internal server error"}); });
export default app;
