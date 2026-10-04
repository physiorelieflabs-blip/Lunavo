type EmbeddingResponse = { model: string; embedding: number[] };

function endpoint(): string {
  const url = process.env.LUNAVO_LOCAL_EMBEDDINGS_URL?.trim();
  if (!url) throw new Error("Self-hosted embeddings are not configured. Set LUNAVO_LOCAL_EMBEDDINGS_URL.");
  return url.replace(/\/$/, "");
}

function model(): string {
  return process.env.LUNAVO_LOCAL_EMBEDDINGS_MODEL?.trim() || "nomic-embed-text";
}

function extractEmbedding(payload: any): number[] {
  if (Array.isArray(payload?.data?.[0]?.embedding)) return payload.data[0].embedding;
  if (Array.isArray(payload?.embedding)) return payload.embedding;
  if (Array.isArray(payload?.embeddings?.[0])) return payload.embeddings[0];
  throw new Error("Self-hosted embedding runtime returned no usable vector");
}

function validVector(vector: number[]): boolean {
  return vector.length > 0 && vector.length <= 32_768 && vector.every((value) => Number.isFinite(value));
}

export async function embedLocal(
  input: string | string[],
  options: { model?: string; timeoutMs?: number } = {},
): Promise<EmbeddingResponse | { model: string; embeddings: number[][] }> {
  const url = endpoint();
  const selectedModel = options.model?.trim() || model();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 60_000, 5_000), 300_000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, input }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!response.ok) throw new Error(`Self-hosted embeddings failed with HTTP ${response.status}`);
    if (typeof input === "string") {
      const vector = extractEmbedding(payload);
      if (!validVector(vector)) throw new Error("Self-hosted embedding vector failed validation");
      return { model: String(payload?.model || selectedModel), embedding: vector };
    }
    const vectors = Array.isArray(payload?.data)
      ? payload.data.map((item: any) => item?.embedding).filter((item: unknown): item is number[] => Array.isArray(item))
      : Array.isArray(payload?.embeddings) ? payload.embeddings : [];
    if (vectors.length !== input.length || vectors.some((vector: number[]) => !validVector(vector))) {
      throw new Error("Self-hosted embedding batch failed validation");
    }
    return { model: String(payload?.model || selectedModel), embeddings: vectors };
  } finally {
    clearTimeout(timeout);
  }
}

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.LUNAVO_LOCAL_EMBEDDINGS_URL?.trim());
}
