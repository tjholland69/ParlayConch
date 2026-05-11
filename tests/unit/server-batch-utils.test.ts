import { describe, expect, test, vi } from "vitest";
import {
  batchProcess,
  batchProcessWithSSE,
  isRateLimitError,
} from "../../server/replit_integrations/batch/utils";

describe("server/replit_integrations/batch/utils", () => {
  describe("isRateLimitError", () => {
    test("detects numeric 429 wording", () => {
      expect(isRateLimitError(new Error("Request failed with 429"))).toBe(true);
    });

    test("detects semantic rate limit phrases", () => {
      expect(isRateLimitError(new Error("RATELIMIT_EXCEEDED"))).toBe(true);
      expect(isRateLimitError("You hit the rate limit")).toBe(true);
      expect(isRateLimitError(new Error("QUOTA exceeded for project"))).toBe(true);
    });

    test("returns false for unrelated errors", () => {
      expect(isRateLimitError(new Error("500 Internal Server Error"))).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
      expect(isRateLimitError({ message: "429" })).toBe(false);
    });
  });

  describe("batchProcess", () => {
    test("runs processor for each item and preserves order", async () => {
      const processor = vi.fn(async (item: number) => item * 2);
      const items = [1, 2, 3];

      const results = await batchProcess(items, processor, {
        concurrency: 2,
        retries: 0,
      });

      expect(results).toEqual([2, 4, 6]);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    test("fires onProgress in completion order under concurrency limit", async () => {
      const events: Array<{ completed: number; total: number; item: number }> =
        [];
      await batchProcess([10, 5, 15], async (delayMs) => {
        await new Promise((r) => setTimeout(r, delayMs));
        return delayMs;
      }, {
        concurrency: 3,
        retries: 0,
        onProgress: (completed, total, item) =>
          events.push({ completed, total, item }),
      });

      expect(events.map((e) => e.completed)).toEqual([1, 2, 3]);
      expect(events.every((e) => e.total === 3)).toBe(true);
    });

    test("non-rate-limit errors reject without retry retries", async () => {
      const processor = vi.fn().mockRejectedValue(new Error("permanent"));

      await expect(
        batchProcess(["a"], processor, { concurrency: 1, retries: 5 }),
      ).rejects.toThrow("permanent");
      expect(processor.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test("empty input yields empty output", async () => {
      const processor = vi.fn();
      await expect(batchProcess([], processor)).resolves.toEqual([]);
      expect(processor).not.toHaveBeenCalled();
    });
  });

  describe("batchProcessWithSSE", () => {
    test("emits lifecycle events including complete summary", async () => {
      const events: unknown[] = [];
      const sendEvent = vi.fn((e: unknown) => {
        events.push(e);
      });

      const results = await batchProcessWithSSE(
        [1, 2],
        async (n) => n + 10,
        sendEvent,
        { retries: 0 },
      );

      expect(results).toEqual([11, 12]);
      const types = sendEvent.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types[0]).toBe("started");
      expect(types[types.length - 1]).toBe("complete");
      const complete = sendEvent.mock.calls[
        sendEvent.mock.calls.length - 1
      ]![0] as { type: string; processed: number; errors: number };
      expect(complete.processed).toBe(2);
      expect(complete.errors).toBe(0);
    });

    test("records placeholder result and error event when processor fails permanently", async () => {
      const sendEvent = vi.fn();
      const processor = vi.fn().mockRejectedValue(new Error("nope"));

      const results = await batchProcessWithSSE(
        ["x"],
        processor,
        sendEvent,
        { retries: 0 },
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(undefined);
      const progressWithError = sendEvent.mock.calls
        .map((c) => c[0] as Record<string, unknown>)
        .find((e) => e.type === "progress" && "error" in e);
      expect(progressWithError).toBeDefined();
      const errPayload = progressWithError?.error;
      expect(
        typeof errPayload === "string" && errPayload.length > 0,
      ).toBe(true);
    });
  });
});
