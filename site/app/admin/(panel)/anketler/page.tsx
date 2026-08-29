import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { surveyCompletions } from "@/db/schema";
import { listSurveys, getSurveyById } from "@/lib/survey";
import { fmtDate } from "@/lib/format";
import { PageTitle, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";
import { SurveyResults } from "@/components/SurveyResults";
import { PublishSurveyButton, DeleteSurveyButton } from "@/components/admin/SurveyAdminButtons";

export default async function AdminSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  // Sonuç görünümü: ?sonuc=<anketId>
  const resultId = Number(params.sonuc) || 0;
  if (resultId) {
    const survey = await getSurveyById(resultId);
    if (survey) {
      return (
        <>
          <PageTitle title={`${survey.title} — Sonuçlar`} action={<Link href="/admin/anketler" className="btn-secondary btn-sm">← Anketler</Link>} />
          <SurveyResults survey={survey} base={`/admin/anketler?sonuc=${survey.id}`} params={params} canExport />
        </>
      );
    }
  }

  const list = await listSurveys();
  const counts = await db
    .select({ key: surveyCompletions.surveyKey, n: sql<number>`count(*)`.mapWith(Number) })
    .from(surveyCompletions)
    .groupBy(surveyCompletions.surveyKey);
  const countOf = (key: string) => counts.find((c) => c.key === key)?.n ?? 0;

  return (
    <>
      <PageTitle title="Anketler" action={<Link href="/admin/anketler/yeni" className="btn-primary"><Icon name="plus" className="size-4" /> Yeni anket</Link>} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Anket</th><th>Durum</th><th>Soru</th><th>Katılım</th><th>Yayın tarihi</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">Henüz anket yok.</td></tr>}
            {list.map((s) => (
              <tr key={s.id}>
                <td><p className="font-semibold text-navy-800">{s.title}</p>{s.intro && <p className="max-w-[320px] truncate text-xs text-muted">{s.intro}</p>}</td>
                <td>{s.status === "published" ? <Chip color="green">Yayında</Chip> : <Chip color="gray">Taslak</Chip>}</td>
                <td>{s.questions.length}</td>
                <td>{countOf(s.key)} kişi</td>
                <td className="text-xs">{s.publishedAt ? <span className="date-chip">{fmtDate(s.publishedAt)}</span> : "—"}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={`/admin/anketler?sonuc=${s.id}`} className="btn-secondary btn-sm">Sonuçlar</Link>
                    <Link href={`/admin/anketler/${s.id}`} className="btn-secondary btn-sm">Düzenle</Link>
                    <PublishSurveyButton id={s.id} published={s.status === "published"} />
                    <DeleteSurveyButton id={s.id} title={s.title} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
