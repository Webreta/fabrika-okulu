import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const COOKIE_NAME = "fabo_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: "admin" | "teacher" | "student";
  isSuperTeacher: boolean;
  panelTheme: string;
  surveyVersion: number;
  surveySkipped: boolean;
};

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number, remember = true) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  jar.delete(COOKIE_NAME);
}

export async function destroyAllSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function displayName(u: { firstName: string; lastName: string; email: string }) {
  const n = `${u.firstName} ${u.lastName}`.trim();
  return n || u.email.split("@")[0];
}

// Aynı render ağacında tekrar çağrılabilir — tek DB sorgusu
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isSuperTeacher: users.isSuperTeacher,
      panelTheme: users.panelTheme,
      surveyVersion: users.surveyVersion,
      surveySkipped: users.surveySkipped,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row || !row.active) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  if (row.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.sessionId));
  }
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    name: displayName(row),
    role: row.role,
    isSuperTeacher: row.isSuperTeacher || row.role === "admin",
    panelTheme: row.panelTheme,
    surveyVersion: row.surveyVersion,
    surveySkipped: row.surveySkipped,
  };
});

/** Öğrenci paneli: giriş şart */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/panel/giris?r=${encodeURIComponent(next)}` : "/panel/giris");
  return user;
}

/** Eğitmen paneli: teacher veya admin */
export async function requireTeacher(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/egitmen/giris");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/panel");
  return user;
}

/** Yönetim paneli: yalnızca admin */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/giris");
  if (user.role !== "admin") redirect("/panel");
  return user;
}

export function isStaff(u: SessionUser | null) {
  return !!u && (u.role === "admin" || u.role === "teacher");
}
