import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth/session";
import { studentCertificates } from "@/lib/data/student";
import { fmtDate } from "@/lib/format";
import { siteUrl } from "@/lib/mailer";
import { PageTitle, Empty } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { CertificateCanvas } from "@/components/CertificateCanvas";

export default async function CertificatesPage() {
  const user = (await getCurrentUser())!;
  const list = await studentCertificates(user.id);
  // Kapak önizlemesi için gerçek QR (doğrulama adresi) üretilir
  const qrs = await Promise.all(
    list.map(({ ic, tpl }) => (tpl.fields.qr.enabled ? QRCode.toDataURL(siteUrl(`/sertifika/${ic.token}`), { margin: 1, width: 200, errorCorrectionLevel: "M" }) : Promise.resolve(null)))
  );
  return (
    <>
      <PageTitle title="Sertifikalarım" />
      {list.length === 0 ? (
        <Empty text="Henüz sertifikan yok. Programı tamamladığında eğitmenin sertifikanı tanımlar." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ ic, tplTitle, tpl }, i) => (
            <div key={ic.id} className="card overflow-hidden p-0">
              <a href={`/sertifika/${ic.token}`} target="_blank" className="block border-b border-line bg-surface transition hover:opacity-90" title="Sertifikayı görüntüle">
                <CertificateCanvas
                  imageUrl={tpl.imageUrl}
                  imageWidth={tpl.imageWidth}
                  imageHeight={tpl.imageHeight}
                  fields={tpl.fields}
                  name={ic.holderName}
                  course={ic.courseName}
                  date={fmtDate(ic.issuedAt, true)}
                  qrDataUrl={qrs[i]}
                />
              </a>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon name="award" className="size-5" /></span>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-navy-800">{tplTitle}</h3>
                    <p className="truncate text-sm text-muted">{ic.courseName}</p>
                    <p className="mt-0.5 text-xs text-muted">{fmtDate(ic.issuedAt, true)}</p>
                  </div>
                </div>
                <a href={`/sertifika/${ic.token}`} target="_blank" className="btn-primary mt-4 w-full">Görüntüle / indir</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
