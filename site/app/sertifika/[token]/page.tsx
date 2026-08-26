import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { issuedCertificates, certificateTemplates } from "@/db/schema";
import { CertificateCanvas } from "@/components/CertificateCanvas";
import { certSerial } from "@/lib/certificates";
import { fmtDate } from "@/lib/format";
import { siteUrl } from "@/lib/mailer";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Sertifika Doğrulama", robots: { index: false, follow: false } };

export default async function CertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db
    .select({ ic: issuedCertificates, t: certificateTemplates })
    .from(issuedCertificates)
    .innerJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
    .where(eq(issuedCertificates.token, token))
    .limit(1);

  if (!row) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Sertifika bulunamadı</h1>
          <p className="mt-2 text-muted">Bağlantı geçersiz ya da sertifika iptal edilmiş.</p>
          <Link href="/" className="btn-primary mt-6">Anasayfa</Link>
        </div>
      </div>
    );
  }
  const url = siteUrl(`/sertifika/${token}`);
  const qr = row.t.fields.qr.enabled ? await QRCode.toDataURL(url, { margin: 1, width: 400, errorCorrectionLevel: "M" }) : null;
  const date = fmtDate(row.ic.issuedAt, true);
  const serial = certSerial(row.ic.id, row.ic.issuedAt);

  return (
    <div className="min-h-screen bg-surface">
      <div className="h-1.5 bg-navy-800" />
      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/"><Image src="/img/site/logo.webp" alt="Fabrika Okulu" width={110} height={125} className="h-12 w-auto" /></Link>
          <span className="badge bg-emerald-50 text-emerald-700">✓ Doğrulanmış belge</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 text-center print:hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Sertifika Doğrulama</p>
          <h1 className="mt-1 text-2xl font-bold text-navy-800">{row.t.title}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted">
            Bu sayfa, <b className="text-navy-800">{row.ic.holderName}</b> adlı katılımcının <b className="text-navy-800">{row.ic.courseName}</b> eğitimini başarıyla tamamlayarak bu sertifikayı almaya hak kazandığını doğrular.
          </p>
          <PrintButton />
        </div>
        <div className="mx-auto max-w-4xl overflow-hidden rounded-xl shadow-xl print:max-w-none print:rounded-none print:shadow-none" id="cert">
          <CertificateCanvas
            imageUrl={row.t.imageUrl}
            imageWidth={row.t.imageWidth}
            imageHeight={row.t.imageHeight}
            fields={row.t.fields}
            name={row.ic.holderName}
            course={row.ic.courseName}
            date={date}
            qrDataUrl={qr}
          />
        </div>
        <div className="mx-auto mt-6 max-w-4xl print:hidden">
          <div className="card p-0 overflow-hidden">
            <div className="border-b border-line bg-navy-800 px-5 py-2.5 text-sm font-bold text-white">Belge Bilgileri</div>
            <dl className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-muted">Seri No</dt><dd className="font-mono font-semibold text-navy-800">{serial}</dd></div>
              <div className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-muted">Belge sahibi</dt><dd className="font-semibold text-navy-800">{row.ic.holderName}</dd></div>
              <div className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-muted">Eğitim</dt><dd className="text-right font-semibold text-navy-800">{row.ic.courseName}</dd></div>
              <div className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-muted">Veriliş tarihi</dt><dd className="font-semibold text-navy-800">{date}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Belge türü</dt><dd className="font-semibold text-navy-800">{row.t.title}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Düzenleyen</dt><dd className="font-semibold text-navy-800">Fabrika Okulu</dd></div>
            </dl>
          </div>
          <p className="mt-4 text-center text-xs text-muted">Bu belgenin geçerliliği yukarıdaki bilgilerle sınırlıdır ve yalnızca bu sayfa üzerinden doğrulanabilir.<br />Doğrulama adresi: {url}</p>
        </div>
      </main>
      <style>{`@media print { @page { size: ${row.t.imageWidth}px ${row.t.imageHeight}px; margin: 0 } body { background: #fff } main { padding: 0; max-width: none } }`}</style>
    </div>
  );
}
