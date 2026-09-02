import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSurveyById, getSurveyAnswers, completedSurveyKeys } from "@/lib/survey";
import { groupBySection, isVisible, toArr } from "@/lib/survey-logic";
import { PageTitle } from "@/components/panel/ui";
import { SurveyForm } from "@/components/panel/SurveyForm";
import { Icon } from "@/components/site/Icon";

/**
 * Hedef testi: doldurmadıysa (ya da test düzenlenebilirse ve güncellemek istiyorsa) form;
 * tamamladıysa yalnızca kendi cevapları (başka katılımcıların sonuçları gösterilmez).
 */
export default async function SurveyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duzenle?: string }> }) {
  const { id } = await params;
  const { duzenle } = await searchParams;
  const user = (await getCurrentUser())!;
  const survey = await getSurveyById(Number(id));
  if (!survey || survey.status !== "published") notFound();
  const [answers, done] = await Promise.all([getSurveyAnswers(user.id, survey.key), completedSurveyKeys(user.id)]);
  const completed = done.has(survey.key);
  const back = <Link href="/panel/anket" className="btn-secondary btn-sm">← Kariyer Hedefim</Link>;

  if (!completed || (duzenle && survey.editable)) {
    return (
      <>
        <PageTitle title={survey.title} action={back} />
        <div className="card mx-auto max-w-2xl">
          <SurveyForm schema={{ id: survey.id, title: survey.title, intro: survey.intro, mode: survey.mode, sections: survey.sections, questions: survey.questions }} answers={answers} skipIntro={!!duzenle} />
        </div>
      </>
    );
  }

  // Kendi cevapları: bölüm bölüm, görünen sorular; seçenek değerleri etikete çevrilir
  const groups = groupBySection(survey.sections, survey.questions)
    .map((g) => ({ ...g, questions: g.questions.filter((q) => isVisible(q, answers)) }))
    .filter((g) => g.questions.length > 0);
  const show = (q: (typeof survey.questions)[number]) => {
    const vals = toArr(answers[q.key]).filter((x) => x !== "");
    if (!vals.length) return null;
    return vals.map((v) => q.options?.find((o) => o.value === v)?.label ?? v);
  };

  return (
    <>
      <PageTitle
        title={survey.title}
        sub={survey.editable ? "Cevaplarını istediğin zaman güncelleyebilirsin." : "Bu test tek seferlik; verdiğin cevaplar aşağıda."}
        action={<div className="flex gap-2">{back}{survey.editable && <Link href={`/panel/anket/${survey.id}?duzenle=1`} className="btn-primary btn-sm"><Icon name="edit" className="size-4" /> Cevaplarımı güncelle</Link>}</div>}
      />
      <div className="card mx-auto max-w-2xl space-y-6">
        {groups.map((g) => (
          <section key={g.key || "_"}>
            {g.label && <h3 className="mb-3 text-lg font-bold text-navy-800">{g.label}</h3>}
            <dl className="divide-y divide-line">
              {g.questions.map((q) => {
                const vals = show(q);
                return (
                  <div key={q.key} className="py-3">
                    <dt className="text-sm font-semibold text-navy-800">{q.label}</dt>
                    <dd className="mt-1 text-sm">
                      {!vals ? <span className="text-muted">Boş bırakıldı</span> : vals.length === 1 && q.type !== "checkbox" ? (
                        <span className={q.type === "textarea" ? "whitespace-pre-line" : ""}>{vals[0]}</span>
                      ) : (
                        <ul className="list-disc space-y-0.5 pl-5">{vals.map((v) => <li key={v}>{v}</li>)}</ul>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
