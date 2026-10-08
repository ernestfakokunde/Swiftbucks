import type { Request, Response } from "express";
import { z } from "zod";
import {
  getMe,
  loginUser,
  logoutUser,
  SESSION_COOKIE_OPTIONS,
  SESSION_MS,
} from "../services/auth.service.js";
import { AppError } from "../services/wallet.service.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { token, user } = await loginUser(
    parsed.data.email,
    parsed.data.password,
  );

  res.cookie("sid", token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MS,
  });

  return res.status(200).json(user);
}

export async function me(req: Request, res: Response) {
  if (req.userId === undefined) {
    throw new AppError(401, "Not logged in");
  }

  return res.status(200).json(await getMe(req.userId));
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.sid;
  if (token) await logoutUser(token);
  res.clearCookie("sid", SESSION_COOKIE_OPTIONS);

  return res.status(204).send();
}
