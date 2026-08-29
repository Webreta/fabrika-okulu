import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listSurveys, completedSurveyKeys } from "@/lib/survey";
import { fmtDate } from "@/lib/format";
import { PageTitle, Empty, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function SurveyListPage() {
  const user = (await getCurrentUser())!;
  const [list, done] = await Promise.all([listSurveys(true), completedSurveyKeys(user.id)]);
  return (
    <>
      <PageTitle title="Anketler" />
      {list.length === 0 ? (
        <Empty text="Şu anda yayında anket yok." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => {
            const completed = done.has(s.key);
            return (
              <div key={s.id} className="card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon name="survey" className="size-6" /></span>
                  {completed ? <Chip color="green">Tamamlandı</Chip> : <Chip color="amber">Bekliyor</Chip>}
                </div>
                <h3 className="mt-3 font-bold text-navy-800">{s.title}</h3>
                {s.intro && <p className="mt-1 line-clamp-3 text-sm text-muted">{s.intro}</p>}
                {s.publishedAt && <p className="mt-1 text-xs text-muted">Yayın: <span className="date-chip">{fmtDate(s.publishedAt)}</span></p>}
                <Link href={`/panel/anket/${s.id}`} className={`mt-4 w-full ${completed ? "btn-secondary" : "btn-primary"}`}>
                  {completed ? "Sonuçları gör" : "Anketi doldur"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
