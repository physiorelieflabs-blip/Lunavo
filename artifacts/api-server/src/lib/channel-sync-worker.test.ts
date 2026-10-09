import { describe, expect, it } from "vitest";
import { assertChannelSyncResult, retryDelaySeconds } from "./channel-sync-worker";

describe("channel sync execution evidence", () => {
  it("does not call an adapter response successful without provider evidence and local commit", () => {
    expect(() => assertChannelSyncResult({ status: "succeeded", requestId: "req-1", providerConfirmed: true }, "pull")).toThrow(/localCommitConfirmed/);
    expect(() => assertChannelSyncResult({ status: "succeeded", requestId: "req-1", localCommitConfirmed: true }, "push")).toThrow(/providerConfirmed/);
  });

  it("accepts explicit complete pull and push acknowledgements", () => {
    expect(assertChannelSyncResult({
      status: "succeeded",
      requestId: "req-42",
      providerConfirmed: true,
      localCommitConfirmed: true,
      metrics: { read: 12, created: 4, updated: 8, skipped: 0, errors: 0 },
    }, "pull").status).toBe("succeeded");
    expect(assertChannelSyncResult({
      status: "succeeded",
      requestId: "req-43",
      providerConfirmed: true,
      metrics: { read: 0, created: 0, updated: 12, skipped: 0, errors: 0 },
    }, "push").status).toBe("succeeded");
  });

  it("bounds retry backoff and honours capped attempts", () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(30);
    expect(retryDelaySeconds(100)).toBe(900);
  });

  it("rejects negative or fractional adapter metrics", () => {
    expect(() => assertChannelSyncResult({
      status: "succeeded",
      requestId: "req-44",
      providerConfirmed: true,
      metrics: { read: -1 },
    }, "push")).toThrow(/metrics/);
  });
});
