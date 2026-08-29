import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, coupons } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { PageTitle, Chip } from "@/components/panel/ui";
import { DocumentUploadForm } from "@/components/panel/DocumentUploadForm";

export default async function DocumentsPage() {
  const user = (await getCurrentUser())!;
  const list = await db.select({ d: documents, percent: coupons.percent, expiresAt: coupons.expiresAt, used: coupons.usedCount, limit: coupons.usageLimit }).from(documents).leftJoin(coupons, eq(documents.couponCode, coupons.code)).where(eq(documents.userId, user.id)).orderBy(desc(documents.createdAt));
  return (
    <>
      <PageTitle title="Belge Yükle" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-bold text-navy-800">Yeni belge</h2>
          <p className="mb-4 text-sm text-muted">Öğrenci / yeni mezun indirimi için belgeni yükle, sana özel kupon tanımlayalım.</p>
          <DocumentUploadForm />
        </div>
        <div className="card">
          <h2 className="mb-4 font-bold text-navy-800">Belgelerim</h2>
          {list.length === 0 ? (
            <p className="text-sm text-muted">Henüz belge yüklemedin.</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map(({ d, percent, expiresAt, used, limit }) => {
                const expired = !!expiresAt && expiresAt.getTime() < Date.now();
                const usedUp = (limit ?? 0) > 0 && (used ?? 0) >= (limit ?? 0);
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy-800">{d.fileName}</p>
                        <p className="text-xs text-muted"><span className="date-chip">{fmtDate(d.createdAt)}</span>{d.note && ` · ${d.note}`}</p>
                      </div>
                      {d.status === "coupon_issued" ? <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" title="Kupon verildi"><Icon name="check" className="size-4" /></span> : d.status === "rejected" ? <Chip color="red">Reddedildi</Chip> : <Chip color="amber">İnceleniyor</Chip>}
                    </div>
                    {d.status === "coupon_issued" && d.couponCode && (
                      <div className={`mt-2 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${expired || usedUp ? "border-line bg-surface opacity-70" : "border-emerald-200 bg-emerald-50"}`}>
                        <Icon name="gift" className="size-5 shrink-0 text-emerald-600" />
                        <span className="font-mono text-base font-bold tracking-wider text-navy-800">{d.couponCode}</span>
                        {percent != null && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">%{percent} indirim</span>}
                        <span className="text-xs text-muted">
                          {usedUp ? "Kullanıldı" : expired ? `Süresi doldu (${fmtDate(expiresAt)})` : expiresAt ? `Son kullanım: ${fmtDate(expiresAt)}` : "Süresiz"}
                        </span>
                        {!usedUp && !expired && <span className="ml-auto text-xs text-muted">Sepette kupon alanına yaz</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
