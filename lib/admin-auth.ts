import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "portfolio_admin";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && sessionSecret());
}

export function isValidAdminPassword(candidate: unknown) {
  if (!isAdminConfigured() || typeof candidate !== "string") return false;
  return safeEqual(candidate, process.env.ADMIN_PASSWORD ?? "");
}

export async function isAdminAuthenticated() {
  if (!isAdminConfigured()) return false;

  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;

  const [issuedAt, signature] = value.split(".");
  const issuedAtSeconds = Number(issuedAt);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    !issuedAt ||
    !signature ||
    !Number.isInteger(issuedAtSeconds) ||
    issuedAtSeconds > nowSeconds ||
    nowSeconds - issuedAtSeconds > SESSION_MAX_AGE
  ) {
    return false;
  }

  return safeEqual(signature, sign(issuedAt));
}

export async function createAdminSession() {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, `${issuedAt}.${sign(issuedAt)}`, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
