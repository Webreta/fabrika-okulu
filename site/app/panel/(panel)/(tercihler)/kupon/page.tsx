import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons, documents, courses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { couponLabel } from "@/lib/coupon-label";
import { Icon } from "@/components/site/Icon";
import { CopyButton } from "@/components/panel/CopyButton";

type Row = {
  c: typeof coupons.$inferSelect;
  courseTitle: string | null;
  docId: number | null;
  docFileName: string | null;
  docCreatedAt: Date | null;
};

function couponState(c: Row["c"]) {
  const expired = !!c.expiresAt && c.expiresAt.getTime() < Date.now();
  const usedUp = c.usageLimit > 0 && c.usedCount >= c.usageLimit;
  return { expired, usedUp, active: !expired && !usedUp };
}

function CouponCard({ row }: { row: Row }) {
  const { c, courseTitle, docFileName, docCreatedAt } = row;
  const { expired, usedUp, active } = couponState(c);
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${active ? "border-emerald-200 bg-emerald-50" : "border-line bg-surface opacity-70"}`}>
      <Icon name="gift" className="size-5 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold tracking-wider text-navy-800">{c.code}</span>
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{couponLabel(c)}</span>
          {active && <CopyButton text={c.code} />}
        </div>
        <p className="mt-1 text-xs text-muted">
          {courseTitle ? `Geçerli eğitim: ${courseTitle}` : "Tüm eğitimlerde geçerli"}
          {" · "}
          {usedUp ? "Kullanıldı" : expired ? `Süresi doldu (${fmtDate(c.expiresAt)})` : c.expiresAt ? `Son kullanım: ${fmtDate(c.expiresAt)}` : "Süresiz"}
          {docFileName && <> · Belge: {docFileName}{docCreatedAt && <> (<span className="date-chip">{fmtDate(docCreatedAt)}</span>)</>}</>}
        </p>
      </div>
      {active && <Link href="/sepet" className="text-xs font-semibold text-sky-600 hover:underline">Sepette kullan</Link>}
    </li>
  );
}

function Section({ title, hint, rows, empty }: { title: string; hint: string; rows: Row[]; empty: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-bold text-navy-800">{title}</h2>
      <p className="mb-4 text-xs text-muted">{hint}</p>
      {rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="space-y-2">{rows.map((r) => <CouponCard key={r.c.id} row={r} />)}</ul>}
    </div>
  );
}

/** Kuponlarım: belge ile kazanılanlar ve yöneticinin hesaba doğrudan tanımladıkları */
export default async function CouponsPage() {
  const user = (await getCurrentUser())!;
  const rows: Row[] = await db
    .select({ c: coupons, courseTitle: courses.title, docId: documents.id, docFileName: documents.fileName, docCreatedAt: documents.createdAt })
    .from(coupons)
    .leftJoin(documents, eq(documents.couponCode, coupons.code))
    .leftJoin(courses, eq(coupons.courseId, courses.id))
    .where(eq(coupons.userId, user.id))
    .orderBy(desc(coupons.createdAt));
  const fromDocs = rows.filter((r) => r.docId != null);
  const assigned = rows.filter((r) => r.docId == null);
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Kuponlarım</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Belge yükleyerek kazandığım kuponlar"
          hint="Öğrenci/mezun belgen onaylanınca tanımlanan indirimler."
          rows={fromDocs}
          empty={<>Henüz belgeyle kazanılmış kuponun yok. <Link href="/panel/belge" className="font-semibold text-sky-600 hover:underline">Belge yükle</Link></>}
        />
        <Section
          title="Hesabıma tanımlanan kuponlar"
          hint="Yönetimin sana özel olarak tanımladığı indirimler."
          rows={assigned}
          empty="Hesabına özel tanımlanmış kupon yok."
        />
      </div>
    </>
  );
}
