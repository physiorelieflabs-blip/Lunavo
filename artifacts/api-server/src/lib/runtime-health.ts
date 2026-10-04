import { readFile } from "node:fs/promises";
import { resolveLocalAiProfile } from "./self-hosted-ai";
import { socialGatewayRequest } from "./social-gateway-client";

type Probe = {
  configured: boolean;
  reachable: boolean;
  healthy: boolean;
  error: string | null;
};

function localHealthUrl(raw: string): string {
  const url = new URL(raw);
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const response = await fetch(url, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const raw = await response.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch {}
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: error instanceof Error ? error.message : "request failed" } };
  }
}

function modelListUrl(raw: string): string {
  const url = new URL(raw);
  if (/\/chat\/completions\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, "/models");
  else if (!/\/models\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/models";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function checkLocalAiHealth(): Promise<Probe & { model: string | null; modelAvailable: boolean }> {
  const raw = process.env.LUNAVO_LOCAL_LLM_URL?.trim() || process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim();
  if (!raw) return { configured: false, reachable: false, healthy: false, error: "Self-hosted AI endpoint is not configured", model: null, modelAvailable: false };
  let selected;
  try {
    selected = resolveLocalAiProfile("general");
  } catch (error) {
    return { configured: true, reachable: false, healthy: false, error: error instanceof Error ? error.message : "Invalid local AI configuration", model: null, modelAvailable: false };
  }
  let response;
  try {
    response = await fetchJson(modelListUrl(selected.url));
  } catch (error) {
    return { configured: true, reachable: false, healthy: false, error: error instanceof Error ? error.message : "Invalid local AI endpoint", model: selected.model, modelAvailable: false };
  }
  if (!response.ok && /(?:^|\/\/)(?:localhost|127\.0\.0\.1|ollama)(?::\d+)?(?:\/|$)/i.test(selected.url)) {
    const url = new URL(selected.url);
    url.pathname = "/api/tags";
    response = await fetchJson(url.toString());
  }
  const configuredModel = selected.model;
  const ids = [
    ...(Array.isArray(response.body?.data) ? response.body.data.map((x: any) => String(x?.id || "")).filter(Boolean) : []),
    ...(Array.isArray(response.body?.models) ? response.body.models.map((x: any) => String(x?.name || x?.model || "")).filter(Boolean) : []),
  ];
  const modelAvailable = configuredModel ? ids.includes(configuredModel) || ids.some((id: string) => id.split(":")[0] === configuredModel.split(":")[0]) : false;
  return {
    configured: true,
    reachable: response.ok,
    healthy: response.ok && modelAvailable,
    error: response.ok ? (modelAvailable ? null : "Configured local model is not available: " + configuredModel) : String(response.body?.error || "Local AI catalogue returned HTTP " + response.status),
    model: configuredModel,
    modelAvailable,
  };
}

export async function checkLocalFxHealth(): Promise<Probe & { configuredPairs: number | null }> {
  const ratebook = process.env.FX_RATES_FILE?.trim();
  let fileHealthy = false;
  let configuredPairs: number | null = null;
  if (ratebook) {
    try {
      const parsed = JSON.parse(await readFile(ratebook, "utf8")) as any;
      const rates = parsed?.rates;
      if (rates && typeof rates === "object" && !Array.isArray(rates)) {
        configuredPairs = Object.values(rates).reduce((count: number, row: any) => count + Object.keys(row || {}).length, 0);
        fileHealthy = configuredPairs > 0;
      }
    } catch {}
  }
  const raw = process.env.LUNAVO_LOCAL_FX_URL?.trim();
  if (!raw) return { configured: Boolean(ratebook), reachable: fileHealthy, healthy: fileHealthy, error: fileHealthy ? null : "Self-hosted FX ratebook is unavailable", configuredPairs };
  const response = await fetchJson(localHealthUrl(raw));
  return {
    configured: true,
    reachable: response.ok,
    healthy: response.ok && fileHealthy,
    error: response.ok ? (fileHealthy ? null : "FX gateway is reachable but the local ratebook has no configured pairs") : String(response.body?.error || "FX gateway returned HTTP " + response.status),
    configuredPairs,
  };
}

export async function checkSocialGatewayHealth(): Promise<Probe & { providers: Record<string, boolean> | null }> {
  try {
    const body = await socialGatewayRequest<{ status?: string; providers?: Record<string, boolean> }>("health");
    const providers = body.providers && typeof body.providers === "object" ? body.providers : null;
    return { configured: true, reachable: true, healthy: body.status === "ok", error: body.status === "ok" ? null : "Social gateway reported an unhealthy status", providers };
  } catch (error) {
    return { configured: Boolean(process.env.LUNAVO_SOCIAL_GATEWAY_URL), reachable: false, healthy: false, error: error instanceof Error ? error.message : "Social gateway unavailable", providers: null };
  }
}

async function checkWorker(urlEnv: string, label: string): Promise<Probe> {
  const raw = process.env[urlEnv]?.trim();
  if (!raw) return { configured: false, reachable: false, healthy: false, error: label + " worker is not configured" };
  try {
    const response = await fetchJson(localHealthUrl(raw));
    return { configured: true, reachable: response.ok, healthy: response.ok, error: response.ok ? null : String(response.body?.error || label + " worker returned HTTP " + response.status) };
  } catch (error) {
    return { configured: true, reachable: false, healthy: false, error: error instanceof Error ? error.message : "Invalid " + label + " worker endpoint" };
  }
}

export async function checkMediaWorkersHealth() {
  return {
    image: await checkWorker("LUNAVO_LOCAL_IMAGE_URL", "Local image"),
    video: await checkWorker("LUNAVO_LOCAL_VIDEO_URL", "Local video"),
  };
}
