import { beforeEach, describe, expect, test, vi } from "vitest";
import { requestJson } from "../../mobile/src/lib/request-json";

describe("mobile/lib/request-json", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test("attaches Bearer token and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 7 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestJson<{ id: number }>({
      baseUrl: "https://api.test",
      method: "GET",
      path: "/api/me",
      token: "sess-token",
    });

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sess-token",
          Accept: "application/json",
        }),
      }),
    );
  });

  test("throws server message on non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ message: "Not authenticated" }),
      }),
    );

    await expect(
      requestJson({ baseUrl: "https://api.test", method: "GET", path: "/api/me" }),
    ).rejects.toThrow("Not authenticated");
  });

  test("returns undefined for 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body");
        },
      }),
    );

    await expect(
      requestJson({ baseUrl: "https://api.test", method: "DELETE", path: "/api/thing" }),
    ).resolves.toBeUndefined();
  });

  test("omits Authorization when token is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestJson({ baseUrl: "https://api.test", method: "GET", path: "/api/public" });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
