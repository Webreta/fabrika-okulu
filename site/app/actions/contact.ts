"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { sendMail, emailTemplate, adminEmails } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import type { FormState } from "@/app/actions/auth";

const schema = z.object({
  name: z.string().trim().min(2, "Adınızı girin."),
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(5, "İletinizi yazın."),
  website: z.string().optional(), // honeypot
});

export async function sendContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Form hatalı." };
  const d = parsed.data;
  if (d.website) return { ok: "Mesajınız alındı." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`contact:${ip}`, 5, 60 * 60 * 1000)) {
    return { error: "Çok fazla mesaj gönderdiniz. Daha sonra tekrar deneyin." };
  }

  await db.insert(contactMessages).values({
    name: d.name,
    email: d.email,
    subject: d.subject ?? "",
    message: d.message,
  });

  const contact = await getSetting("contact");
  const to = [...(await adminEmails()), contact.email].filter(Boolean);
  await sendMail({
    type: "contact",
    to,
    replyTo: d.email,
    subject: `İletişim formu: ${d.subject || d.name}`,
    html: emailTemplate({
      title: "Yeni iletişim mesajı",
      html: `<p><b>Ad:</b> ${d.name}<br><b>E-posta:</b> ${d.email}<br><b>Konu:</b> ${d.subject ?? "-"}</p><p style="white-space:pre-line">${d.message}</p>`,
    }),
  });
  return { ok: "Mesajınız alındı, en kısa sürede dönüş yapacağız." };
}
