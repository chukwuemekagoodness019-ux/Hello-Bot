import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 4;

interface TokenRecord {
  expiresAt: number;
}

const tokens = new Map<string, TokenRecord>();

function gc() {
  const now = Date.now();
  for (const [t, rec] of tokens) {
    if (rec.expiresAt < now) tokens.delete(t);
  }
}

export function adminLogin(secretKey: string, password: string, email?: string): string | null {
  if (!ADMIN_PASSWORD || !ADMIN_SECRET_KEY) return null;
  if (ADMIN_EMAIL && (!email || email.trim().toLowerCase() !== ADMIN_EMAIL.trim().toLowerCase())) return null;
  if (secretKey.trim() !== ADMIN_SECRET_KEY.trim()) return null;
  if (password.trim() !== ADMIN_PASSWORD.trim()) return null;
  const token = crypto.randomBytes(32).toString("hex");
  tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  gc();
  const token = (req.header("x-admin-token") || "").trim();
  if (!token) {
    res.status(401).json({ error: "Admin auth required", code: "ADMIN_AUTH_REQUIRED" });
    return;
  }
  const rec = tokens.get(token);
  if (!rec || rec.expiresAt < Date.now()) {
    res.status(401).json({ error: "Invalid or expired admin token", code: "ADMIN_AUTH_INVALID" });
    return;
  }
  next();
}
