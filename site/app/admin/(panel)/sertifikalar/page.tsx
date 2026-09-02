import Link from "next/link";
import { desc, eq, sql, ilike, or, and } from "drizzle-orm";
import { db } from "@/db";
import { certificateTemplates, issuedCertificates, users, courses } from "@/db/schema";
import { CERT_CONDITIONS } from "@/lib/certificates";
import { fmtDate } from "@/lib/format";
import { PageTitle, Tabs, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { CertificateCanvas } from "@/components/CertificateCanvas";
import { DeleteTemplateButton, DuplicateTemplateButton } from "@/components/admin/CertificateDesigner";
import { RevokeCertButton } from "@/components/teacher/IssueCertButton";

export default async function CertificatesAdminPage({ searchParams }: { searchParams: Promise<{ sekme?: string; cert?: string; s?: string }> }) {
  const { sekme, cert, s } = await searchParams;
  const templates = await db.select({ t: certificateTemplates, issued: sql<number>`(select count(*) from ${issuedCertificates} i where i.template_id = "certificate_templates"."id")`.mapWith(Number), courseTitle: courses.title }).from(certificateTemplates).leftJoin(courses, sql`${courses.id} = (${certificateTemplates.rule}->>'courseId')::int`).orderBy(desc(certificateTemplates.id));

  if (sekme === "verilenler") {
    const q = s?.trim() ?? "";
    const list = await db
      .select({ ic: issuedCertificates, tplTitle: certificateTemplates.title, email: users.email })
      .from(issuedCertificates)
      .innerJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
      .innerJoin(users, eq(issuedCertificates.userId, users.id))
      .where(and(cert ? eq(issuedCertificates.templateId, Number(cert)) : undefined, q ? or(ilike(issuedCertificates.holderName, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined))
      .orderBy(desc(issuedCertificates.issuedAt))
      .limit(300);
    return (
      <>
        <PageTitle title="Sertifikalar" />
        <Tabs items={[{ href: "/admin/sertifikalar", label: "Tasarımlar", active: false }, { href: "/admin/sertifikalar/ver", label: "Sertifika ver", active: false }, { href: "/admin/sertifikalar?sekme=verilenler", label: "Verilen sertifikalar", active: true }]} />
        <form className="mb-4 flex flex-wrap gap-2"><input type="hidden" name="sekme" value="verilenler" /><select name="cert" defaultValue={cert ?? ""} className="input w-auto"><option value="">Tüm tasarımlar</option>{templates.map(({ t }) => <option key={t.id} value={t.id}>{t.title}</option>)}</select><input name="s" defaultValue={q} placeholder="Ad / e-posta" className="input max-w-xs" /><button className="btn-secondary">Filtrele</button></form>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>Tasarım</th><th>Tarih</th><th>Bağlantı</th><th></th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">Sertifika yok.</td></tr>}
              {list.map(({ ic, tplTitle, email }) => (
                <tr key={ic.id}>
                  <td><p className="font-semibold text-navy-800">{ic.holderName}</p><p className="text-xs text-muted">{email}</p></td>
                  <td className="text-sm">{ic.courseName}</td>
                  <td className="text-sm">{tplTitle}</td>
                  <td className="text-xs"><span className="date-chip">{fmtDate(ic.issuedAt)}</span></td>
                  <td><a href={`/sertifika/${ic.token}`} target="_blank" className="text-xs text-sky-600 underline">/sertifika/{ic.token.slice(0, 8)}…</a></td>
                  <td><RevokeCertButton id={ic.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Sertifikalar" action={<Link href="/admin/sertifikalar/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni tasarım</Link>} />
      <Tabs items={[{ href: "/admin/sertifikalar", label: "Tasarımlar", active: true }, { href: "/admin/sertifikalar/ver", label: "Sertifika ver", active: false }, { href: "/admin/sertifikalar?sekme=verilenler", label: "Verilen sertifikalar", active: false }]} />
      {templates.length === 0 ? (
        <p className="card text-muted">Henüz tasarım yok.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map(({ t, issued, courseTitle }) => (
            <div key={t.id} className="card p-0 overflow-hidden">
              <div className="border-b border-line bg-surface"><CertificateCanvas imageUrl={t.imageUrl} imageWidth={t.imageWidth} imageHeight={t.imageHeight} fields={t.fields} name={t.sampleName} course={t.sampleCourse} date={fmtDate(new Date(), true)} /></div>
              <div className="p-4">
                <h3 className="font-bold text-navy-800">{t.title}</h3>
                <p className="mt-1 text-xs text-muted"><Chip color="sky">{CERT_CONDITIONS[t.rule.condition]}</Chip>{t.rule.auto && <Chip color="green">Otomatik</Chip>} <span className="ml-1">{t.rule.scope === "course" ? courseTitle ?? `Kurs #${t.rule.courseId}` : "Tüm eğitimler"}</span> · {issued} verildi</p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/admin/sertifikalar/${t.id}`} className="btn-primary btn-sm">Düzenle</Link>
                  <DuplicateTemplateButton id={t.id} />
                  <DeleteTemplateButton id={t.id} title={t.title} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
