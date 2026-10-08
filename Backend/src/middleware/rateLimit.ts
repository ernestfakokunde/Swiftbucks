import { rateLimit } from "express-rate-limit";

const tooManyRequests = {
  message: { error: "Too many requests, try again later" },
};

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooManyRequests.message),
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooManyRequests.message),
});

export const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooManyRequests.message),
});

export const walletPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(tooManyRequests.message),
});
