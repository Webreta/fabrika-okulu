import "server-only";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificateTemplates, issuedCertificates, users, courses } from "@/db/schema";
import { courseProgress } from "@/lib/data/student";
import { notifyUser } from "@/lib/notify";
import { sendMail, emailTemplate, siteUrl } from "@/lib/mailer";

/**
 * Sertifikayı fiilen tanımlar: kayıt (ad/kurs dondurulur) + öğrenciye bildirim + e-posta.
 * Aynı (şablon, öğrenci, kurs) üçlüsü için tekrar çağrılmak güvenlidir (unique index).
 */
export async function grantCertificate(opts: { templateId: number; userId: number; courseId: number; issuedBy?: number | null }) {
  const [[t], [s], [c]] = await Promise.all([
    db.select().from(certificateTemplates).where(eq(certificateTemplates.id, opts.templateId)).limit(1),
    db.select().from(users).where(eq(users.id, opts.userId)).limit(1),
    db.select().from(courses).where(eq(courses.id, opts.courseId)).limit(1),
  ]);
  if (!t || !s || !c) return { ok: false as const, error: "Kayıt bulunamadı." };
  const token = randomBytes(24).toString("hex");
  const holder = `${s.firstName} ${s.lastName}`.trim() || s.email;
  const r = await db
    .insert(issuedCertificates)
    .values({ templateId: t.id, userId: s.id, courseId: c.id, holderName: holder, courseName: c.title, token, issuedBy: opts.issuedBy ?? null })
    .onConflictDoNothing()
    .returning({ id: issuedCertificates.id });
  if (!r[0]) return { ok: false as const, error: "Bu sertifika zaten verilmiş." };
  const url = `/sertifika/${token}`;
  await notifyUser(s.id, { title: "🎓 Sertifikan hazır", body: `${t.title} · ${c.title}`, url, tag: `cert-${t.id}-${c.id}` });
  await sendMail({
    type: "certificate",
    to: s.email,
    subject: `Sertifikan hazır: ${c.title}`,
    html: emailTemplate({ title: "Tebrikler! 🎓", html: `<p><b>${c.title}</b> programı için <b>${t.title}</b> belgen hazır.</p>`, buttonText: "Sertifikayı gör", buttonUrl: siteUrl(url) }),
  });
  return { ok: true as const, url };
}

/**
 * Otomatik verme: öğrencinin kurstaki ilerlemesi %100'e ulaştıysa,
 * kuralı eşleşen (auto=true, koşul=completed, kapsam uygun) tüm şablonları tanımlar.
 * Her tamamlanma noktasından (ders/sınav/görev) sonra çağrılır; idempotenttir.
 */
export async function autoIssueCertificates(userId: number, courseId: number) {
  const templates = await db.select().from(certificateTemplates);
  const eligible = templates.filter((t) => t.rule.auto && t.rule.condition === "completed" && (t.rule.scope === "all" || t.rule.courseId === courseId));
  if (eligible.length === 0) return;
  const p = await courseProgress(userId, courseId);
  if (p.total === 0 || p.completed < p.total) return;
  for (const t of eligible) {
    await grantCertificate({ templateId: t.id, userId, courseId, issuedBy: null });
  }
}
