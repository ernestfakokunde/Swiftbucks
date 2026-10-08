import { randomBytes, createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { db } from "../prisma/db.js";
import { AppError } from "./wallet.service.js";

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// a real hash of a throwaway password, used to keep timing the same
// when the email doesn't exist (see below)
const DUMMY_HASH = await hashPassword("not-a-real-password");

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function loginUser(emailInput: string, password: string) {
  const email = emailInput.toLowerCase();
  const user = await db.orm.public.User.where({ email }).first();

  // always run one verification, even for unknown emails
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

  if (!user || !user.passwordHash || !ok) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = randomBytes(32).toString("hex");

  await db.orm.public.Session.create({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
  });

  return {
    token,
    user: { id: user.id, email: user.email, username: user.username },
  };
}

export async function logoutUser(token: string) {
  const session = await db.orm.public.Session.where({
    tokenHash: hashToken(token),
  }).first();

  if (session) {
    await db.orm.public.Session.where({ id: session.id }).delete();
  }
}

export async function getMe(userId: number) {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) {
    throw new AppError(401, "Not logged in");
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
  };
}