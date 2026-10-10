import { safeInternalPath } from "@/lib/safe-path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSurveyById, getSurveyAnswers, completedSurveyKeys } from "@/lib/survey";
import { groupBySection, isVisible, toArr, goalQuestion } from "@/lib/survey-logic";
import { goalColor } from "@/lib/survey-logic";
import { PageTitle } from "@/components/panel/ui";
import { SurveyForm } from "@/components/panel/SurveyForm";
import { Icon } from "@/components/site/Icon";

/**
 * Hedef testi: doldurmadıysa (ya da test düzenlenebilirse ve güncellemek istiyorsa) form;
 * tamamladıysa yalnızca kendi cevapları (başka katılımcıların sonuçları gösterilmez).
 */
export default async function SurveyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duzenle?: string; donus?: string }> }) {
  const { id } = await params;
  const { duzenle, donus } = await searchParams;
  // Satın alma akışından gelindiyse (yalnızca site içi yol) tamamlanınca oraya dönüş bağlantısı gösterilir
  const returnTo = safeInternalPath(donus, "") || null;
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
        {returnTo && <p className="mx-auto mb-4 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seçtiğin eğitimi alabilmek için önce bu hedef testini tamamlaman gerekiyor. Bitirince satın alma sayfasına dönebilirsin.</p>}
        <div className="card mx-auto max-w-2xl">
          <SurveyForm schema={{ id: survey.id, title: survey.title, intro: survey.intro, mode: survey.mode, sections: survey.sections, questions: survey.questions }} answers={answers} skipIntro={!!duzenle} returnTo={returnTo} />
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
      {/* Hedef bayrağı salt okunur: buradan tek tık değiştirme yok, hedef yalnızca test yeniden çözülerek değişir (2026-10-10) */}
      {(() => {
        const gq = goalQuestion(survey);
        if (!gq) return null;
        const val = toArr(answers[gq.key])[0] ?? null;
        const opt = gq.options?.find((o) => o.value === val) ?? null;
        const c = goalColor(opt?.color);
        return (
          <section id="hedef" className="card mx-auto mb-6 max-w-2xl scroll-mt-24" style={opt ? { borderColor: c.hex, background: `${c.hex}22` } : undefined}>
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: opt ? c.hex : "#9aabc7" }}><Icon name="flag" className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/70">Hedef bayrağım</p>
                <h3 className="font-bold text-navy-800">{gq.label}</h3>
                <p className="mt-0.5 text-sm text-navy-700/80">
                  {opt ? <>Şu an: <b>{opt.label}</b>.</> : "Henüz bir hedef seçmedin."}{" "}
                  {survey.editable ? <>Değiştirmek için <Link href={`/panel/anket/${survey.id}?duzenle=1`} className="font-semibold underline underline-offset-2">testi yeniden çöz</Link>.</> : "Bu test tek seferlik olduğu için hedef sonradan değiştirilemez."}
                </p>
              </div>
            </div>
          </section>
        );
      })()}
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
