import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons, users, courses, documents } from "@/db/schema";
import { courseOptions } from "@/lib/data/documents";
import { fmtDate } from "@/lib/format";
import { couponValue } from "@/lib/coupon-label";
import { PageTitle, Chip } from "@/components/panel/ui";
import { CouponsManager, DeleteCouponButton, PersonalCouponCard } from "@/components/admin/CouponsManager";

export default async function CouponsPage() {
  const [list, opts, emails] = await Promise.all([
    db.select({ c: coupons, email: users.email, courseTitle: courses.title, docId: documents.id }).from(coupons).leftJoin(users, eq(coupons.userId, users.id)).leftJoin(courses, eq(coupons.courseId, courses.id)).leftJoin(documents, eq(documents.couponCode, coupons.code)).orderBy(desc(coupons.id)).limit(300),
    courseOptions(),
    db.select({ email: users.email }).from(users).where(eq(users.active, true)).orderBy(users.email).then((r) => r.map((u) => u.email)),
  ]);
  return (
    <>
      <PageTitle title="Kuponlar" sub="Genel kampanya kuponları ve kişiye özel indirimler. Belgeye bağlı kuponlar Belgeler sayfasından verilir." />
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 font-bold text-navy-800">Genel kampanya kuponu</h2>
          <CouponsManager courses={opts} />
        </div>
        <PersonalCouponCard courses={opts} emails={emails} />
      </div>
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Kod</th><th>İndirim</th><th>Kurs</th><th>Sahip</th><th>Kullanım</th><th>Son tarih</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">Kupon yok.</td></tr>}
            {list.map(({ c, email, courseTitle, docId }) => (
              <tr key={c.id}>
                <td className="font-mono font-bold text-navy-800">{c.code}</td>
                <td>{couponValue(c)}</td>
                <td className="text-sm">{courseTitle ?? "Tüm eğitimler"}</td>
                <td className="text-xs">{email ?? "Herkes"}{email && <> <Chip color={docId ? "sky" : "amber"}>{docId ? "Belge" : "Özel"}</Chip></>}</td>
                <td className="text-xs">{c.usedCount}/{c.usageLimit || "∞"} {c.usageLimit > 0 && c.usedCount >= c.usageLimit && <Chip color="gray">Bitti</Chip>}</td>
                <td className="text-xs">{c.expiresAt ? <span className="date-chip">{fmtDate(c.expiresAt)}</span> : "—"}</td>
                <td><DeleteCouponButton id={c.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
