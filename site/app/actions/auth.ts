"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, passwordResets, instructors } from "@/db/schema";
import { verifyPassword, hashPassword, DUMMY_HASH } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  destroyAllSessions,
  getCurrentUser,
  hashToken,
  requireUser,
} from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";

export type FormState = { error?: string; ok?: string };

type Area = "panel" | "egitmen" | "admin";

function safeNext(next: string | undefined, area: Area) {
  const home = area === "panel" ? "/panel" : area === "egitmen" ? "/egitmen" : "/admin";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return home;
  return next;
}

/** Rolün varsayılan ana paneli: admin ve eğitmen doğrudan yönetim paneline gider. */
function homeForRole(role: "admin" | "teacher" | "student") {
  return role === "admin" ? "/admin" : role === "teacher" ? "/egitmen" : "/panel";
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
  remember: z.string().optional(),
  next: z.string().optional(),
  area: z.enum(["panel", "egitmen", "admin"]).default("panel"),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") ?? undefined,
    next: formData.get("next") ?? undefined,
    area: formData.get("area") ?? "panel",
  });
  if (!parsed.success) return { error: "E-posta ve şifre gerekli." };
  const { email, password, remember, next, area } = parsed.data;

  const ip = await clientIp();
  if (!checkRateLimit(`login:${ip}`, 10) || !checkRateLimit(`login:${email}`, 8)) {
    return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." };
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return { error: "E-posta veya şifre hatalı." };

  if (area === "egitmen" && user.role === "student") {
    return { error: "Bu alana yalnızca eğitmenler girebilir." };
  }
  if (area === "admin" && user.role !== "admin") {
    return { error: "Bu alana yalnızca yöneticiler girebilir." };
  }

  await createSession(user.id, remember !== undefined ? remember === "1" : true);
  // Yönlendirme role göre: admin → /admin, eğitmen → /egitmen, öğrenci → /panel.
  // Geçerli bir derin bağlantı (next) verildiyse ona öncelik verilir.
  const home = homeForRole(user.role);
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : home;
  redirect(dest);
}

const registerSchema = z.object({
  firstName: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  lastName: z.string().trim().min(2, "Soyad en az 2 karakter olmalı."),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin."),
  phone: z.string().trim().optional(),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı."),
  password2: z.string(),
  next: z.string().optional(),
  kvkk: z.string().optional(),
});

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const panel = await getSetting("panel");
  if (!panel.registrationOpen) return { error: "Kayıt şu anda kapalı." };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Form hatalı." };
  const d = parsed.data;
  if (d.password !== d.password2) return { error: "Şifreler eşleşmiyor." };
  if (!d.kvkk) return { error: "KVKK aydınlatma metnini onaylamalısın." };

  const ip = await clientIp();
  if (!checkRateLimit(`register:${ip}`, 5)) {
    return { error: "Çok fazla deneme. Daha sonra tekrar deneyin." };
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email)).limit(1);
  if (existing[0]) return { error: "Bu e-posta ile kayıtlı bir hesap zaten var." };

  const [created] = await db
    .insert(users)
    .values({
      email: d.email,
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone ?? "",
      passwordHash: await hashPassword(d.password),
      role: "student",
    })
    .returning({ id: users.id });

  await sendMail({
    type: "welcome",
    to: d.email,
    subject: "Fabrika Okulu'na hoş geldin",
    html: emailTemplate({
      title: `Hoş geldin, ${d.firstName}!`,
      html: `<p>Hesabın oluşturuldu. Çalışma Odan'dan eğitimlerine erişebilir, program seçebilirsin.</p>`,
      buttonText: "Çalışma Odam",
      buttonUrl: siteUrl("/panel"),
    }),
  });

  await createSession(created.id, true);
  redirect(safeNext(d.next, "panel"));
}

export async function logout(formData?: FormData) {
  const to = (formData?.get("to") as string) || "/";
  await destroySession();
  redirect(to.startsWith("/") ? to : "/");
}

export async function lostPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "E-posta adresini gir." };
  const ip = await clientIp();
  if (!checkRateLimit(`lost:${ip}`, 5)) return { error: "Çok fazla deneme." };

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  // Kullanıcı yoksa da aynı mesaj (bilgi sızıntısı olmasın)
  if (user) {
    const token = randomBytes(24).toString("base64url");
    await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));
    await db.insert(passwordResets).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = siteUrl(`/panel/sifre?key=${token}`);
    await sendMail({
      type: "password_reset",
      to: email,
      subject: "Şifre sıfırlama",
      html: emailTemplate({
        title: "Şifreni sıfırla",
        html: `<p>Şifreni yenilemek için aşağıdaki butona tıkla. Bağlantı 1 saat geçerlidir.</p><p style="font-size:12px;color:#5f6b80">${link}</p>`,
        buttonText: "Yeni şifre belirle",
        buttonUrl: link,
      }),
    });
  }
  return { ok: "Eğer bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi." };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const key = String(formData.get("key") ?? "");
  const pwd = String(formData.get("password") ?? "");
  const pwd2 = String(formData.get("password2") ?? "");
  if (pwd.length < 6) return { error: "Şifre en az 6 karakter olmalı." };
  if (pwd !== pwd2) return { error: "Şifreler eşleşmiyor." };
  const rows = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.id, hashToken(key)), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  const pr = rows[0];
  if (!pr) return { error: "Bağlantı geçersiz veya süresi dolmuş." };
  await db.update(users).set({ passwordHash: await hashPassword(pwd), updatedAt: new Date() }).where(eq(users.id, pr.userId));
  await db.delete(passwordResets).where(eq(passwordResets.userId, pr.userId));
  await destroyAllSessions(pr.userId);
  await createSession(pr.userId, true);
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, pr.userId)).limit(1);
  redirect(`${homeForRole(u?.role ?? "student")}?sifirlandi=1`);
}

/** Öğrenci + eğitmen paneli ortak hesap güncelleme */
export async function updateAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const currentPass = String(formData.get("currentPass") ?? "");
  const newPass = String(formData.get("newPass") ?? "");

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (firstName && lastName) {
    patch.firstName = firstName;
    patch.lastName = lastName;
  }
  patch.phone = phone;

  if (newPass) {
    if (newPass.length < 6) return { error: "Yeni şifre en az 6 karakter olmalı." };
    const rows = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!(await verifyPassword(currentPass, rows[0]?.hash ?? DUMMY_HASH))) {
      return { error: "Mevcut şifre hatalı." };
    }
    patch.passwordHash = await hashPassword(newPass);
  }
  await db.update(users).set(patch).where(eq(users.id, user.id));
  // Eğitmen profili adı da senkron kalsın
  if (firstName && lastName) {
    await db
      .update(instructors)
      .set({ name: `${firstName} ${lastName}` })
      .where(eq(instructors.userId, user.id));
  }
  return { ok: "Bilgiler güncellendi." };
}

export async function setPanelTheme(theme: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(users).set({ panelTheme: theme.slice(0, 30) }).where(eq(users.id, user.id));
}
