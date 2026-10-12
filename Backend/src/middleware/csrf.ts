import type { NextFunction, Request, Response } from "express";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const webhookPath = "/api/webhooks";

function requestOrigin(req: Request): string | null {
  const origin = req.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      return parsed.origin === origin ? parsed.origin : null;
    } catch {
      return null;
    }
  }

  const referer = req.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!mutatingMethods.has(req.method.toUpperCase())) return next();
  if (req.path === webhookPath || req.path.startsWith(`${webhookPath}/`)) return next();

  const expectedOrigin = new URL(process.env.FRONTEND_URL ?? "http://localhost:3000").origin;
  if (requestOrigin(req) !== expectedOrigin) {
    return res.status(403).json({ error: "Invalid request origin" });
  }

  const contentType = req.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return res.status(403).json({ error: "Content-Type must be application/json" });
  }
  return next();
}
