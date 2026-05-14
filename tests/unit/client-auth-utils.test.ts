import { describe, expect, test, vi, afterEach } from "vitest";
import { isUnauthorizedError, redirectToLogin } from "../../client/src/lib/auth-utils";

describe("client/lib/auth-utils", () => {
  describe("isUnauthorizedError", () => {
    test("returns true for message matching 401 Unauthorized prefix pattern", () => {
      expect(isUnauthorizedError(new Error("401: foo Unauthorized"))).toBe(true);
      expect(isUnauthorizedError(new Error("401: Unauthorized"))).toBe(true);
    });

    test("returns false when status or wording does not match", () => {
      expect(isUnauthorizedError(new Error("403: Unauthorized"))).toBe(false);
      expect(isUnauthorizedError(new Error("Not authorized"))).toBe(false);
      expect(isUnauthorizedError(new Error("401: Forbidden"))).toBe(false);
    });
  });

  describe("redirectToLogin", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    test("invokes toast when provided before scheduling navigation", () => {
      vi.useFakeTimers();
      const toast = vi.fn();
      const location = { href: "" };
      vi.stubGlobal("window", { location } as Window & typeof globalThis);

      redirectToLogin(toast);

      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast.mock.calls[0]![0]).toMatchObject({
        title: "Unauthorized",
        variant: "destructive",
      });

      vi.advanceTimersByTime(499);
      expect(location.href).toBe("");

      vi.advanceTimersByTime(1);
      expect(location.href).toBe("/api/login");
    });

    test("still navigates without toast callback", () => {
      vi.useFakeTimers();
      const location = { href: "" };
      vi.stubGlobal("window", { location } as Window & typeof globalThis);

      redirectToLogin();

      vi.advanceTimersByTime(500);
      expect(location.href).toBe("/api/login");
    });
  });
});
