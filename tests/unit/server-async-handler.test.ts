import { describe, expect, test, vi } from "vitest";
import type { Request, Response } from "express";
import { asyncHandler } from "../../server/async-handler";

describe("server/async-handler", () => {
  test("delegates synchronous resolution to Express next when handler rejects", async () => {
    const err = new Error("boom");
    const handler = vi.fn().mockRejectedValue(err);
    const next = vi.fn();
    const wrapped = asyncHandler(handler);

    wrapped({} as Request, {} as Response, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("does not call next when handler resolves successfully", async () => {
    const handler = vi.fn().mockResolvedValue("ok");
    const next = vi.fn();
    const wrapped = asyncHandler(handler);

    wrapped({} as Request, {} as Response, next);

    await vi.waitFor(() => expect(handler).toHaveResolved());
    await Promise.resolve(); // flush microtasks from handler path
    expect(next).not.toHaveBeenCalled();
  });
});
