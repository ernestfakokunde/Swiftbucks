import type { Request, Response, NextFunction } from "express";
import { AppError } from "../services/wallet.service.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Our own labelled errors: send the status and message the service chose
  if (err instanceof AppError) {
    return res.status(Number(err.status)).json({ error: err.message });
  }

  // Anything else is a real bug or outage: log it, tell the user nothing sensitive
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
}