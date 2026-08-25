import { getCurrentUser } from "@/lib/auth/session";
import { studentCertificates } from "@/lib/data/student";
import { fmtDate } from "@/lib/format";
import { PageTitle, Empty } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function CertificatesPage() {
  const user = (await getCurrentUser())!;
  const list = await studentCertificates(user.id);
  return (
    <>
      <PageTitle title="Sertifikalarım" />
      {list.length === 0 ? (
        <Empty text="Henüz sertifikan yok. Programı tamamladığında eğitmenin sertifikanı tanımlar." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ ic, tplTitle }) => (
            <div key={ic.id} className="card">
              <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon name="award" className="size-6" /></span>
              <h3 className="mt-3 font-bold text-navy-800">{tplTitle}</h3>
              <p className="text-sm text-muted">{ic.courseName}</p>
              <p className="mt-1 text-xs text-muted">{fmtDate(ic.issuedAt, true)}</p>
              <a href={`/sertifika/${ic.token}`} target="_blank" className="btn-primary mt-4 w-full">Görüntüle / indir</a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
