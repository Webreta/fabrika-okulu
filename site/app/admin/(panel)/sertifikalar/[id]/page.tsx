import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificateTemplates, courses } from "@/db/schema";
import { DEFAULT_CERT_FIELDS, DEFAULT_CERT_RULE } from "@/lib/certificates";
import { PageTitle } from "@/components/panel/ui";
import { CertificateDesigner } from "@/components/admin/CertificateDesigner";

export default async function CertificateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cs = await db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(courses.title);
  if (id === "yeni") {
    return (
      <>
        <PageTitle title="Yeni sertifika tasarımı" />
        <CertificateDesigner initial={{ title: "", imageUrl: "", imageWidth: 1600, imageHeight: 1131, fields: DEFAULT_CERT_FIELDS, rule: DEFAULT_CERT_RULE, sampleName: "Ayşe Yılmaz", sampleCourse: "Örnek Eğitim" }} courses={cs} />
      </>
    );
  }
  const [t] = await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, Number(id))).limit(1);
  if (!t) notFound();
  return (
    <>
      <PageTitle title={t.title} />
      <CertificateDesigner initial={{ id: t.id, title: t.title, imageUrl: t.imageUrl, imageWidth: t.imageWidth, imageHeight: t.imageHeight, fields: { ...DEFAULT_CERT_FIELDS, ...t.fields }, rule: t.rule, sampleName: t.sampleName, sampleCourse: t.sampleCourse }} courses={cs} />
    </>
  );
}
