"use server";

import { revalidatePath } from "next/cache";
import { NOTIFY_CATEGORIES } from "@/lib/notify-prefs";
import { addressFromForm, addressFormatError } from "@/lib/address";
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
  destroyOtherSessions,
  getCurrentUser,
  hashToken,
  requireUser,
} from "@/lib/auth/session";
import { checkRateLimit, isRateLimited, recordFailure, clearRateLimit } from "@/lib/auth/rate-limit";
import { passwordError } from "@/lib/auth/password-rules";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { safeInternalPath } from "@/lib/safe-path";

/** values: kaydedilen alanların son hâli (form, kayıttan sonra bunları gösterir) */
export type FormState = { error?: string; ok?: string; values?: Record<string, string> };

// Uzunluk sınırları (kayıt, giriş ve hesap formları ortak)
const NAME_MAX = 60;
const EMAIL_MAX = 160;
const PHONE_MAX = 30;
const PASSWORD_MAX = 200;

type Area = "panel" | "egitmen" | "admin";

function safeNext(next: string | undefined, area: Area) {
  const home = area === "panel" ? "/panel" : area === "egitmen" ? "/egitmen" : "/admin";
  return safeInternalPath(next, home);
}

/** Rolün varsayılan ana paneli: admin ve eğitmen doğrudan yönetim paneline gider. */
function homeForRole(role: "admin" | "teacher" | "student") {
  return role === "admin" ? "/admin" : role === "teacher" ? "/egitmen" : "/panel";
}

/** Doğrulama kütüphanesinin kendi (İngilizce) iletisi kullanıcıya gösterilmez */
function trMessage(message: string | undefined) {
  return !message || /^(invalid|too |expected|required|unrecognized)/i.test(message) ? "Form eksik ya da hatalı; alanları kontrol et." : message;
}

async function clientIp() {
  const h = await headers();
  // Ters vekil (Traefik) x-real-ip başlığını kendisi yazar; istemcinin gönderdiği değer buraya ulaşmaz
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX),
  password: z.string().min(1).max(PASSWORD_MAX),
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
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
    return { error: tooLong ? "E-posta veya şifre hatalı." : "E-posta ve şifre gerekli." };
  }
  const { email, password, remember, next, area } = parsed.data;

  // Yalnızca BAŞARISIZ denemeler sayılır. Sayaç (IP + e-posta) çiftine bağlıdır: başkası bir kullanıcının adresiyle
  // yanlış şifre deneyerek onun girişini kilitleyemez. Tek IP en çok 30, tek hesap (tüm IP'lerden) en çok 50 yanlış
  // deneme yapabilir; hesap sınırı IP sınırından yüksek olduğu için tek bir saldırgan hesap sınırını dolduramaz.
  const ip = await clientIp();
  const pairKey = `login:${ip}:${email}`, ipKey = `login-ip:${ip}`, mailKey = `login-mail:${email}`;
  if (isRateLimited(pairKey, 8) || isRateLimited(ipKey, 30) || isRateLimited(mailKey, 50)) {
    return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." };
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    recordFailure(pairKey);
    recordFailure(ipKey);
    recordFailure(mailKey);
    return { error: "E-posta veya şifre hatalı." };
  }
  clearRateLimit(pairKey);

  if (area === "egitmen" && user.role === "student") {
    return { error: "Bu alana yalnızca eğitmenler girebilir." };
  }
  if (area === "admin" && user.role !== "admin") {
    return { error: "Bu alana yalnızca yöneticiler girebilir." };
  }

  // "Beni hatırla" kutusu işaretli değilse form alanı hiç gelmez → kısa oturum
  await createSession(user.id, remember === "1");
  // Yönlendirme role göre: admin → /admin, eğitmen → /egitmen, öğrenci → /panel.
  // Geçerli bir derin bağlantı (next, yalnızca site içi yol) verildiyse ona öncelik verilir.
  redirect(safeInternalPath(next, homeForRole(user.role)));
}

const registerSchema = z.object({
  firstName: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(NAME_MAX, `Ad en fazla ${NAME_MAX} karakter olabilir.`),
  lastName: z.string().trim().min(2, "Soyad en az 2 karakter olmalı.").max(NAME_MAX, `Soyad en fazla ${NAME_MAX} karakter olabilir.`),
  email: z.string().trim().toLowerCase().max(EMAIL_MAX, `E-posta en fazla ${EMAIL_MAX} karakter olabilir.`).email("Geçerli bir e-posta girin."),
  phone: z.string().trim().max(PHONE_MAX, `Telefon en fazla ${PHONE_MAX} karakter olabilir.`).optional(),
  // Şifre kuralı (en az 8 karakter, yalnız boşluk olamaz) passwordError ile denetlenir
  password: z.string("Şifreni yaz.").max(PASSWORD_MAX, `Şifre en fazla ${PASSWORD_MAX} karakter olabilir.`),
  password2: z.string("Şifreni tekrar yaz."),
  next: z.string().optional(),
  kvkk: z.string().optional(),
});

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const panel = await getSetting("panel");
  if (!panel.registrationOpen) return { error: "Kayıt şu anda kapalı." };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: trMessage(parsed.error.issues[0]?.message) };
  const d = parsed.data;
  const pwdErr = passwordError(d.password);
  if (pwdErr) return { error: pwdErr };
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
  const to = safeInternalPath(formData?.get("to"), "/");
  await destroySession();
  redirect(to);
}

export async function lostPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "E-posta adresini gir." };
  if (email.length > EMAIL_MAX) return { error: `E-posta en fazla ${EMAIL_MAX} karakter olabilir.` };
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
  const pwdErr = passwordError(pwd);
  if (pwdErr) return { error: pwdErr };
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
  const [row] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, phone: users.phone, hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) return { error: "Hesap bulunamadı." };
  // Formda gelmeyen alan (null) değiştirilmez; böylece eksik gönderim kayıtlı değeri silmez
  const field = (name: string, current: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : current;
  };
  const firstName = field("firstName", row.firstName);
  const lastName = field("lastName", row.lastName);
  const phone = field("phone", row.phone);
  const currentPass = String(formData.get("currentPass") ?? "");
  const newPass = String(formData.get("newPass") ?? "");
  // Hata durumunda da form yazılanı korur
  const values = { firstName, lastName, phone };

  // Ad/soyad sertifikaya basılır: dolu bir alan boşaltılamaz (eskiden sessizce yok sayılıyordu)
  if ((!firstName && row.firstName) || (!lastName && row.lastName)) return { error: "Ad ve soyad boş bırakılamaz.", values };
  if (firstName.length > NAME_MAX) return { error: `Ad en fazla ${NAME_MAX} karakter olabilir.`, values };
  if (lastName.length > NAME_MAX) return { error: `Soyad en fazla ${NAME_MAX} karakter olabilir.`, values };
  if (phone.length > PHONE_MAX) return { error: `Telefon en fazla ${PHONE_MAX} karakter olabilir.`, values };

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date(), firstName, lastName, phone };

  if (newPass) {
    const pwdErr = passwordError(newPass, "Yeni şifre");
    if (pwdErr) return { error: pwdErr, values };
    if (!(await verifyPassword(currentPass, row.hash ?? DUMMY_HASH))) {
      return { error: "Mevcut şifre hatalı.", values };
    }
    patch.passwordHash = await hashPassword(newPass);
  }
  await db.update(users).set(patch).where(eq(users.id, user.id));
  // Şifre değişti: bu tarayıcı dışındaki tüm oturumlar kapanır
  if (newPass) await destroyOtherSessions(user.id);
  // Eğitmen profili adı da senkron kalsın
  if ((firstName !== row.firstName || lastName !== row.lastName) && firstName && lastName) {
    await db
      .update(instructors)
      .set({ name: `${firstName} ${lastName}` })
      .where(eq(instructors.userId, user.id));
  }
  // Üst çubuktaki ad ve hesap sayfaları yeni değerlerle çizilsin
  revalidatePath("/", "layout");
  return {
    ok: newPass ? "Bilgiler güncellendi. Şifren değişti; diğer cihazlardaki oturumların kapatıldı." : "Bilgiler güncellendi.",
    values,
  };
}

export async function setPanelTheme(theme: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.update(users).set({ panelTheme: theme.slice(0, 30) }).where(eq(users.id, user.id));
}

/** Adreslerim: fatura + gönderim (form alanları billing_* ve shipping_*) */
export async function saveAddresses(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum bulunamadı." };
  // Biçim denetimi (telefon, kimlik/vergi no, posta kodu); boş alanlar serbest
  const same = !!formData.get("shipping_same");
  const formatError = addressFormatError(formData, "billing_", "Fatura adresi") ?? (same ? null : addressFormatError(formData, "shipping_", "Gönderim adresi"));
  if (formatError) return { error: formatError };
  const billing = addressFromForm(formData, "billing_");
  const shipping = same ? billing : addressFromForm(formData, "shipping_");
  await db.update(users).set({ addresses: { billing, shipping } }).where(eq(users.id, user.id));
  revalidatePath("/panel/adres");
  return { ok: "Adresler kaydedildi." };
}

/** Bildirim tercihleri: yalnızca bilinen kategoriler, boolean */
export async function setNotifyPrefs(input: Record<string, boolean>) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  const prefs: Record<string, boolean> = {};
  for (const c of NOTIFY_CATEGORIES) {
    if (input[c.key] === false) prefs[c.key] = false;
    if (input[`mail:${c.key}`] === false) prefs[`mail:${c.key}`] = false;
  }
  await db.update(users).set({ notifyPrefs: prefs }).where(eq(users.id, user.id));
  return { ok: true as const };
}
