/** Self-hosted authentication compatibility shim.
 *
 * Lunavo authentication is provided by local sessions. Hosted Clerk proxying
 * is intentionally disabled; this file remains only for stale imports.
 */
import type { RequestHandler } from "express";

export const CLERK_PROXY_PATH="/api/__clerk";

export function getClerkProxyHost(req:{headers:{"x-forwarded-host"?:string|string[];host?:string}}):string|undefined {
  const forwarded=req.headers["x-forwarded-host"];
  const raw=Array.isArray(forwarded)?forwarded[0]:forwarded;
  return raw?.split(",")[0]?.trim()||req.headers.host?.trim()||undefined;
}

export function clerkProxyMiddleware():RequestHandler {
  return (_req,res,_next)=>res.status(410).json({
    error:"Hosted authentication proxy disabled",
    code:"SELF_HOSTED_AUTH_ONLY",
  });
}
