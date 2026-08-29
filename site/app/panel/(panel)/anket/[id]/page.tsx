import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSurveyById, getSurveyAnswers, completedSurveyKeys, getSurveyStats } from "@/lib/survey";
import { PageTitle } from "@/components/panel/ui";
import { SurveyForm } from "@/components/panel/SurveyForm";

export default async function SurveyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duzenle?: string }> }) {
  const { id } = await params;
  const { duzenle } = await searchParams;
  const user = (await getCurrentUser())!;
  const survey = await getSurveyById(Number(id));
  if (!survey || survey.status !== "published") notFound();
  const [answers, done] = await Promise.all([getSurveyAnswers(user.id, survey.key), completedSurveyKeys(user.id)]);
  const completed = done.has(survey.key);

  // Doldurmadıysa (ya da güncellemek istiyorsa) form
  if (!completed || duzenle) {
    return (
      <>
        <PageTitle title={survey.title} action={<Link href="/panel/anket" className="btn-secondary btn-sm">← Anketler</Link>} />
        <div className="card mx-auto max-w-2xl">
          <SurveyForm schema={{ id: survey.id, title: survey.title, intro: survey.intro, sections: survey.sections, questions: survey.questions }} answers={answers} />
        </div>
      </>
    );
  }

  // Tamamladıysa: katılımcı ortalamaları (açık uçlular hariç) + kendi cevabı
  const stats = await getSurveyStats(survey);
  return (
    <>
      <PageTitle
        title={survey.title}
        sub={`Teşekkürler! ${stats.participants} katılımcının cevap dağılımı aşağıda (açık uçlu sorular hariç).`}
        action={<div className="flex gap-2"><Link href="/panel/anket" className="btn-secondary btn-sm">← Anketler</Link><Link href={`/panel/anket/${survey.id}?duzenle=1`} className="btn-secondary btn-sm">Cevaplarımı güncelle</Link></div>}
      />
      {stats.questions.length === 0 ? (
        <p className="card text-muted">Bu ankette istatistiği gösterilecek kapalı uçlu soru yok.</p>
      ) : (
        <div className="grid max-w-3xl gap-4">
          {stats.questions.map((q) => {
            const mine = answers[q.key];
            const mineArr = Array.isArray(mine) ? mine : mine ? [mine] : [];
            return (
              <div key={q.key} className="card">
                <h3 className="font-bold text-navy-800">{q.label}</h3>
                <p className="mb-3 text-xs text-muted">{q.total} kişi cevapladı</p>
                <div className="space-y-2">
                  {q.options.map((o) => {
                    const isMine = mineArr.includes(o.value);
                    return (
                      <div key={o.value}>
                        <div className="mb-0.5 flex items-center justify-between text-sm">
                          <span className={isMine ? "font-semibold text-navy-800" : ""}>{o.label}{isMine && <span className="ml-1 text-xs text-sky-600">· senin cevabın</span>}</span>
                          <span className="text-muted">%{o.percent} · {o.count}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-surface">
                          <div className={`h-full ${isMine ? "bg-sky-500" : "bg-navy-200"}`} style={{ width: `${o.percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
