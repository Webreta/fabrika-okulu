import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listSurveys, completedSurveyKeys, studentGoalFlags } from "@/lib/survey";
import { goalColor } from "@/lib/survey-logic";
import { fmtDate } from "@/lib/format";
import { PageTitle, Empty, Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

export default async function SurveyListPage() {
  const user = (await getCurrentUser())!;
  const [list, done, flags] = await Promise.all([listSurveys(true), completedSurveyKeys(user.id), studentGoalFlags(user.id)]);
  return (
    <>
      <PageTitle title="Kariyer Hedefim" />
      {list.length === 0 ? (
        <Empty text="Şu anda yayında hedef testi yok." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => {
            const completed = done.has(s.key);
            // Ana soru cevaplandıysa kart o hedefin rengine döner ve bayrak taşır
            const flag = flags.find((f) => f.surveyId === s.id);
            const goal = flag?.answer ? goalColor(flag.color) : null;
            // Zemin bayrak renginin saydam tonu: yazı rengi temadan gelir, kart açık ve koyu temada okunur
            return (
              <div key={s.id} className="card flex flex-col border-2 transition" style={goal ? { borderColor: goal.hex, background: `${goal.hex}22` } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  {goal ? (
                    <span className="flex size-11 items-center justify-center rounded-xl text-white shadow" style={{ background: goal.hex }}><Icon name="flag" className="size-6" /></span>
                  ) : (
                    <span className="flex size-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon name="survey" className="size-6" /></span>
                  )}
                  {completed ? <Chip color="green">Tamamlandı</Chip> : <Chip color="amber">Bekliyor</Chip>}
                </div>
                <h3 className="mt-3 font-bold text-navy-800">{s.title}</h3>
                {flag?.answer && <p className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-navy-800"><span className="size-2.5 rounded-full" style={{ background: goal!.hex }} /> Hedefim: {flag.answer}</p>}
                {s.intro && <p className="mt-1 line-clamp-3 text-sm text-muted">{s.intro}</p>}
                {s.publishedAt && <p className="mt-1 text-xs text-muted">Yayın: <span className="date-chip">{fmtDate(s.publishedAt)}</span></p>}
                <Link href={`/panel/anket/${s.id}`} className={`mt-4 w-full ${completed ? "btn-secondary" : "btn-primary"}`}>
                  {completed ? "Cevaplarımı gör" : "Teste başla"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
