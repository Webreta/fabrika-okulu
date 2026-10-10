import "server-only";
import nodemailer from "nodemailer";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { categoryOfMailType, wantsEmail } from "@/lib/notify-prefs";

// Yalnızca gerçekten gönderilen türler listelenir (görev/sınav puanlama yok; o şablonlar kaldırıldı)
export const MAIL_TYPES = {
  welcome: { title: "Kayıt hoş geldin maili", to: "öğrenci" },
  new_assignment: { title: "Yeni görev atandığında", to: "kursun öğrencileri" },
  assignment_submitted: { title: "Görev teslim edildiğinde", to: "yönetici + eğitmen" },
  new_quiz: { title: "Yeni sınav atandığında", to: "kursun öğrencileri" },
  question_asked: { title: "Öğrenci soru sorduğunda", to: "yönetici + eğitmen" },
  question_answered: { title: "Soru cevaplandığında", to: "öğrenci" },
  event_reminder: { title: "Etkinlik hatırlatması (1 gün önce)", to: "öğrenci" },
  due_reminder: { title: "Görev son teslim hatırlatması", to: "öğrenci" },
  certificate: { title: "Sertifika verildiğinde", to: "öğrenci" },
  coupon: { title: "Kupon tanımlandığında", to: "öğrenci" },
  order_paid: { title: "Ödeme alındığında", to: "öğrenci + yönetici" },
  document_uploaded: { title: "Belge yüklendiğinde", to: "belge e-postası" },
  daily_report: { title: "Günlük rapor", to: "yönetici + eğitmenler" },
  waitlist: { title: "Kontenjan/yeni dönem açıldığında (bekleme listesi)", to: "haber ver diyenler" },
  favorite_sale: { title: "Favori eğitimde indirim başladığında", to: "favorileyen öğrenciler" },
  preorder_open: { title: "Erken kayıt yapılan eğitim açıldığında", to: "erken kayıt yapan öğrenciler" },
  module_open: { title: "Eğitimde yeni modül açıldığında", to: "dönemin öğrencileri" },
  password_reset: { title: "Şifre sıfırlama", to: "kullanıcı" },
  contact: { title: "İletişim formu", to: "yönetici" },
} as const;

export type MailType = keyof typeof MAIL_TYPES;

const TRANSACTIONAL: MailType[] = ["password_reset", "order_paid", "welcome", "contact", "waitlist"];

async function transporter() {
  const smtp = await getSetting("smtp");
  if (!smtp.host || !smtp.user) return null;
  return {
    t: nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: (smtp.port || 587) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    }),
    from: smtp.from || smtp.user,
    settings: smtp,
  };
}

/** Kullanıcının yazdığı metin e-posta gövdesine girmeden önce HTML'den arındırılır (ad, mesaj, başlık, not…) */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Konu ve adres başlıkları tek satır olmalı: satır sonu başlık eklemeye (header injection) yol açar */
const oneLine = (value: string, max = 250) => value.replace(/[\r\n\t\0]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

/** E-postadaki bağlantı adresi: yalnızca http(s), mailto ve site içi yol; diğerleri (javascript: vb.) boş döner */
export function safeMailUrl(value: unknown): string {
  const u = String(value ?? "").trim();
  return /^(https?:\/\/|mailto:|\/(?!\/))/i.test(u) ? escapeHtml(u) : "";
}

export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * Marka şablonu (açık başlık + logo, buton). Logo PNG'dir (webp Outlook'ta açılmaz) ve CSS `filter` kullanılmaz
 * (Gmail/Outlook filtreyi siler; eskiden lacivert zeminde koyu logo kare gibi görünüyordu, 2026-10-10).
 * title ve buttonText düz metindir, burada kaçışlanır (çağıran ayrıca kaçışlamaz). html gövdesi HTML'dir:
 * içine konan kullanıcı metni çağıran tarafta escapeHtml'den geçirilmelidir.
 */
export function emailTemplate(opts: {
  title: string;
  html: string;
  buttonText?: string;
  buttonUrl?: string;
}) {
  const logo = siteUrl("/img/site/logo-mail.png");
  const btn =
    opts.buttonText && opts.buttonUrl
      ? `<p style="margin:26px 0 8px"><a href="${safeMailUrl(opts.buttonUrl)}" style="display:inline-block;background:#142b56;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${escapeHtml(opts.buttonText)}</a></p>`
      : "";
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f3f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b2437">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:28px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef">
<tr><td style="background:#142b56;height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#fff;padding:22px 28px 16px;text-align:center;border-bottom:1px solid #e3e8ef"><img src="${logo}" alt="Fabrika Okulu" width="64" height="73" style="display:inline-block;width:64px;height:73px;border:0"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px;color:#142b56">${escapeHtml(opts.title)}</h1>
<div style="font-size:15px;line-height:1.6">${opts.html}</div>
${btn}
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafb;font-size:12px;color:#5f6b80;text-align:center">Fabrika Okulu · Kariyer gelişiminde yol arkadaşın.<br>${siteUrl()}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendMail(opts: {
  type: MailType;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  let recipients = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) return false;
  // Konu bazlı e-posta tercihi: kullanıcı bu konuyu kapattıysa ona gönderme (işlemsel türler kapsam dışı)
  if (categoryOfMailType(opts.type) && !TRANSACTIONAL.includes(opts.type)) {
    const lower = recipients.map((r) => r.toLowerCase());
    const rows = await db.select({ email: users.email, prefs: users.notifyPrefs }).from(users).where(inArray(users.email, lower));
    const muted = new Set(rows.filter((r) => !wantsEmail(r.prefs, opts.type)).map((r) => r.email.toLowerCase()));
    recipients = recipients.filter((r) => !muted.has(r.toLowerCase()));
    if (recipients.length === 0) return false;
  }

  const tp = await transporter();
  if (!tp) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[mail:${opts.type}] SMTP yok → ${recipients.join(",")} | ${opts.subject}`);
    }
    return false;
  }
  if (tp.settings.emailsMuted && !TRANSACTIONAL.includes(opts.type)) return false;

  const templates = await getSetting("mailTemplates");
  const tpl = templates[opts.type];
  if (tpl && tpl.enabled === false && !TRANSACTIONAL.includes(opts.type)) return false;
  const subject = oneLine(tpl?.subject?.trim() ? tpl.subject : opts.subject);
  const replyTo = opts.replyTo ? oneLine(opts.replyTo, 200) : undefined;

  try {
    await tp.t.sendMail({
      from: `Fabrika Okulu <${tp.from}>`,
      to: recipients,
      subject,
      html: opts.html,
      replyTo,
    });
    return true;
  } catch (e) {
    console.error("Mail gönderilemedi:", e);
    return false;
  }
}

export async function adminEmails(): Promise<string[]> {
  const smtp = await getSetting("smtp");
  return (smtp.adminEmails || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendTestMail(to: string) {
  const tp = await transporter();
  if (!tp) throw new Error("SMTP sunucusu veya kullanıcı adı boş. Önce ayarları kaydedin.");
  await tp.t.sendMail({
    from: `Fabrika Okulu <${tp.from}>`,
    to,
    subject: "Fabrika Okulu SMTP testi",
    html: emailTemplate({
      title: "SMTP çalışıyor",
      html: `<p>Bu bir test e-postasıdır. Sunucu: ${escapeHtml(tp.settings.host)}:${escapeHtml(tp.settings.port)}</p>`,
    }),
  });
}
