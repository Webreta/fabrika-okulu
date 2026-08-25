import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons, users, courses } from "@/db/schema";
import { courseOptions } from "@/lib/data/documents";
import { fmtDate } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { CouponsManager, DeleteCouponButton } from "@/components/admin/CouponsManager";

export default async function CouponsPage() {
  const [list, opts] = await Promise.all([
    db.select({ c: coupons, email: users.email, courseTitle: courses.title }).from(coupons).leftJoin(users, eq(coupons.userId, users.id)).leftJoin(courses, eq(coupons.courseId, courses.id)).orderBy(desc(coupons.id)).limit(300),
    courseOptions(),
  ]);
  return (
    <>
      <PageTitle title="Kuponlar" sub="Genel kampanya kuponları. Kişiye özel kuponlar Belgeler sayfasından verilir." />
      <CouponsManager courses={opts} />
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Kod</th><th>İndirim</th><th>Kurs</th><th>Sahip</th><th>Kullanım</th><th>Son tarih</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">Kupon yok.</td></tr>}
            {list.map(({ c, email, courseTitle }) => (
              <tr key={c.id}>
                <td className="font-mono font-bold text-navy-800">{c.code}</td>
                <td>%{c.percent}</td>
                <td className="text-sm">{courseTitle ?? "Tüm eğitimler"}</td>
                <td className="text-xs">{email ?? "Herkes"}</td>
                <td className="text-xs">{c.usedCount}/{c.usageLimit || "∞"} {c.usageLimit > 0 && c.usedCount >= c.usageLimit && <Chip color="gray">Bitti</Chip>}</td>
                <td className="text-xs">{c.expiresAt ? fmtDate(c.expiresAt) : "—"}</td>
                <td><DeleteCouponButton id={c.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
