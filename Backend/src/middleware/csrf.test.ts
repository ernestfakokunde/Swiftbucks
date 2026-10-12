import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { csrfProtection } from "./csrf.js";

function invoke(method: string, path: string, headers: Record<string, string>) {
  const req = {
    method,
    path,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const res = { status, json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  csrfProtection(req, res, next);
  return { status, json, next };
}

describe("CSRF request checks", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts JSON mutations from the configured origin", () => {
    vi.stubEnv("FRONTEND_URL", "https://wallet.example.com/app");
    const result = invoke("POST", "/api/wallet/transfer", {
      origin: "https://wallet.example.com",
      "content-type": "application/json; charset=utf-8",
    });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it("accepts a same-origin Referer when Origin is absent", () => {
    vi.stubEnv("FRONTEND_URL", "https://wallet.example.com");
    const result = invoke("POST", "/api/auth/logout", {
      referer: "https://wallet.example.com/profile",
      "content-type": "application/json",
    });
    expect(result.next).toHaveBeenCalledOnce();
  });

  it("rejects a missing or foreign origin and non-JSON content", () => {
    vi.stubEnv("FRONTEND_URL", "https://wallet.example.com");
    const missingOrigin = invoke("POST", "/api/wallet/withdraw", { "content-type": "application/json" });
    const foreignOrigin = invoke("POST", "/api/wallet/withdraw", {
      origin: "https://attacker.example",
      "content-type": "application/json",
    });
    const wrongContentType = invoke("POST", "/api/wallet/withdraw", {
      origin: "https://wallet.example.com",
      "content-type": "text/plain",
    });
    expect(missingOrigin.status).toHaveBeenCalledWith(403);
    expect(foreignOrigin.status).toHaveBeenCalledWith(403);
    expect(wrongContentType.status).toHaveBeenCalledWith(403);
  });

  it("does not restrict safe methods or provider webhooks", () => {
    expect(invoke("GET", "/api/wallet/balance", {}).next).toHaveBeenCalledOnce();
    expect(invoke("POST", "/api/webhooks/paystack", {}).next).toHaveBeenCalledOnce();
    expect(invoke("POST", "/api/webhooks/vtpass", {}).next).toHaveBeenCalledOnce();
  });
});
