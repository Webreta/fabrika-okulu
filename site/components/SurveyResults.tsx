import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, surveyAnswers } from "@/db/schema";
import { getSurveySchema } from "@/lib/survey";
import { fmtDate } from "@/lib/format";
import { Kpi, Chip } from "@/components/panel/ui";
import { ResetSurveyButton } from "@/components/admin/ResetSurveyButton";

const PER_PAGE = 30;

/** Anket sonuçları (eğitmen + admin ortak, server component) */
export async function SurveyResults({ base, params, canExport }: { base: string; params: Record<string, string | undefined>; canExport: boolean }) {
  const schema = await getSurveySchema();
  const page = Math.max(1, Number(params.sayfa) || 1);
  const s = params.s?.trim() ?? "";
  const durum = params.durum ?? "";
  const filters = Object.entries(params).filter(([k, v]) => k.startsWith("f_") && v).map(([k, v]) => [k.slice(2), v!] as const);

  // Kullanıcı seti
  const conds = [eq(users.role, "student")];
  if (s) conds.push(or(ilike(users.firstName, `%${s}%`), ilike(users.lastName, `%${s}%`), ilike(users.email, `%${s}%`))!);
  if (durum === "done") conds.push(sql`${users.surveyVersion} >= ${schema.version}`);
  if (durum === "pending") conds.push(sql`${users.surveyVersion} > 0 and ${users.surveyVersion} < ${schema.version}`);
  if (durum === "never") conds.push(eq(users.surveyVersion, 0));
  for (const [qk, val] of filters) {
    conds.push(sql`exists (select 1 from ${surveyAnswers} sa where sa.user_id = ${users.id} and sa.survey_key = ${schema.key} and sa.question_key = ${qk} and (sa.value = to_jsonb(${val}::text) or sa.value @> to_jsonb(array[${val}::text])))`);
  }
  const [[cnt], list] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(users).where(and(...conds)),
    db.select().from(users).where(and(...conds)).orderBy(desc(users.createdAt)).limit(PER_PAGE).offset((page - 1) * PER_PAGE),
  ]);
  const [[all], [done]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(users).where(eq(users.role, "student")),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(users).where(and(eq(users.role, "student"), sql`${users.surveyVersion} >= ${schema.version}`)),
  ]);

  const uid = Number(params.uid);
  if (uid) {
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    const ans = await db.select().from(surveyAnswers).where(and(eq(surveyAnswers.userId, uid), eq(surveyAnswers.surveyKey, schema.key)));
    return (
      <div className="card">
        <Link href={base} className="text-sm text-sky-600 hover:underline">← Listeye dön</Link>
        <h2 className="mt-2 text-xl font-bold text-navy-800">{u ? `${u.firstName} ${u.lastName}` : "Kullanıcı"}</h2>
        <p className="text-sm text-muted">{u?.email}</p>
        {canExport && u && <div className="mt-2"><ResetSurveyButton userId={u.id} /></div>}
        <dl className="mt-4 space-y-3">
          {schema.questions.map((q) => {
            const a = ans.find((x) => x.questionKey === q.key)?.value;
            const label = Array.isArray(a) ? a.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(", ") : a ? (q.options?.find((o) => o.value === a)?.label ?? a) : "—";
            return <div key={q.key}><dt className="text-xs font-semibold text-muted">{q.label}</dt><dd className="text-sm">{label}</dd></div>;
          })}
        </dl>
      </div>
    );
  }

  const filterable = schema.questions.filter((q) => (q.type === "radio" || q.type === "checkbox") && q.options?.length);
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...extra })) if (v !== undefined && v !== "" && k !== "uid") p.set(k, String(v));
    return `${base}?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Kayıtlı öğrenci" value={all.n} icon="users" />
        <Kpi label="Anketi tamamladı" value={done.n} icon="check" color="green" />
        <Kpi label="Bekliyor" value={all.n - done.n} icon="clock" color="amber" />
        <Kpi label="Tamamlama oranı" value={`%${all.n ? Math.round((done.n / all.n) * 100) : 0}`} icon="chart" color="sky" />
      </div>
      <form className="card grid gap-3 md:grid-cols-4" method="get">
        <input name="s" defaultValue={s} placeholder="Ad / e-posta" className="input" />
        <select name="durum" defaultValue={durum} className="input"><option value="">Tüm durumlar</option><option value="done">Tamamladı</option><option value="pending">Güncelleme bekliyor</option><option value="never">Hiç doldurmadı</option></select>
        {filterable.map((q) => (
          <select key={q.key} name={`f_${q.key}`} defaultValue={params[`f_${q.key}`] ?? ""} className="input">
            <option value="">{q.label}</option>{q.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <div className="flex gap-2 md:col-span-4">
          <button className="btn-primary btn-sm">Filtrele</button>
          <Link href={base} className="btn-secondary btn-sm">Temizle</Link>
          {canExport && <a href={`/api/admin/anket-csv?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()}`} className="btn-secondary btn-sm ml-auto">CSV indir</a>}
        </div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Kayıt</th><th>Durum</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">Kayıt yok.</td></tr>}
            {list.map((u) => (
              <tr key={u.id}>
                <td><Link href={qs({ uid: u.id })} className="font-semibold text-navy-800 hover:underline">{`${u.firstName} ${u.lastName}`.trim() || "—"}</Link></td>
                <td className="text-sm">{u.email}</td>
                <td className="text-xs">{fmtDate(u.createdAt)}</td>
                <td>{u.surveyVersion >= schema.version ? <Chip color="green">Tamamladı</Chip> : u.surveyVersion > 0 ? <Chip color="amber">Güncelleme bekliyor</Chip> : <Chip color="gray">Doldurmadı</Chip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cnt.n > PER_PAGE && (
        <div className="flex justify-center gap-2 text-sm">
          {page > 1 && <Link href={qs({ sayfa: page - 1 })} className="btn-secondary btn-sm">← Önceki</Link>}
          <span className="px-2 py-1 text-muted">{page} / {Math.ceil(cnt.n / PER_PAGE)}</span>
          {page * PER_PAGE < cnt.n && <Link href={qs({ sayfa: page + 1 })} className="btn-secondary btn-sm">Sonraki →</Link>}
        </div>
      )}
    </div>
  );
}
