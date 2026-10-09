import { assertSelfHostedEndpoint } from "./self-hosted-ai";

export type ChannelGatewayOperation = "connection.test" | "sync.execute";

function gatewayConfiguration(): { url: string; token: string } {
  const rawUrl = process.env.LUNAVO_CHANNEL_GATEWAY_URL?.trim();
  const token = process.env.LUNAVO_CHANNEL_GATEWAY_TOKEN?.trim();
  if (!rawUrl || !token) {
    throw new Error("The self-hosted channel adapter gateway is not configured. Set LUNAVO_CHANNEL_GATEWAY_URL and LUNAVO_CHANNEL_GATEWAY_TOKEN.");
  }
  return { url: assertSelfHostedEndpoint(rawUrl), token };
}

export function channelGatewayConfigured(): boolean {
  try { gatewayConfiguration(); return true; } catch { return false; }
}

/**
 * Calls only the private/local channel adapter gateway. Provider access tokens are sent
 * only to this self-hosted boundary and are never returned to the browser or logged.
 */
export async function channelGatewayRequest<T = unknown>(
  operation: ChannelGatewayOperation,
  payload: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  const configuration = gatewayConfiguration();
  let response: Response;
  try {
    response = await fetch(configuration.url + "/v1/operation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "x-lunavo-channel-token": configuration.token,
      },
      body: JSON.stringify({ operation, payload }),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, 180_000))),
    });
  } catch {
    throw new ChannelGatewayError("The self-hosted channel adapter gateway could not be reached", true);
  }

  const raw = await response.text();
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

  if (!response.ok) {
    const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const message = typeof value.error === "string" ? value.error.slice(0, 500) : "The self-hosted channel adapter gateway returned an error";
    const retryable = typeof value.retryable === "boolean" ? value.retryable : response.status >= 500 || response.status === 429;
    throw new ChannelGatewayError(message, retryable, typeof value.code === "string" ? value.code.slice(0, 80) : undefined);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ChannelGatewayError("The channel adapter gateway returned an invalid response", false, "invalid_gateway_response");
  }
  return body as T;
}

export class ChannelGatewayError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code?: string) {
    super(message);
    this.name = "ChannelGatewayError";
  }
}
