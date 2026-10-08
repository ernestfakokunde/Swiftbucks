import type { NextFunction, Request, Response } from "express";
import { db } from "../prisma/db.js";
import { hashToken } from "../services/auth.service.js";
import { AppError } from "../services/wallet.service.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      rawBody?: Buffer;
    }
  }
}

export function getAuthenticatedUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new AppError(401, "Not logged in");
  }
  return req.userId;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.sid;
  if (!token) {
    throw new AppError(401, "Not logged in");
  }

  const session = await db.orm.public.Session.where({
    tokenHash: hashToken(token),
  }).first();

  if (!session) {
    throw new AppError(401, "Not logged in");
  }

  if (new Date(session.expiresAt) < new Date()) {
    await db.orm.public.Session.where({ id: session.id }).delete();
    throw new AppError(401, "Not logged in");
  }

  req.userId = session.userId;
  next();
}
