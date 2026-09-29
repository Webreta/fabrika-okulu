import Link from "next/link";
import { notFound } from "next/navigation";
import { getSurveyById } from "@/lib/survey";
import { PageTitle, Chip } from "@/components/panel/ui";
import { SurveyBuilder } from "@/components/admin/SurveyBuilder";
import { PublishSurveyButton } from "@/components/admin/SurveyAdminButtons";
import { SurveyCourseLinks } from "@/components/admin/SurveyCourseLinks";
import { surveyCourseIds } from "@/lib/survey-gate";
import { listCourses } from "@/lib/data/courses";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminSurveyEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Sayfa kendi yetkisini denetler: layout'taki yönlendirme, sayfa verisinin yanıt gövdesine yazılmasını engellemez
  await requireAdmin();
  const { id } = await params;
  if (id === "yeni") {
    return (
      <>
        <PageTitle title="Yeni anket" action={<Link href="/admin/anketler" className="btn-secondary btn-sm">← Anketler</Link>} />
        <SurveyBuilder survey={{ title: "", intro: "", mode: "steps", sections: { genel: "Genel" }, questions: [] }} />
      </>
    );
  }
  const s = await getSurveyById(Number(id));
  if (!s) notFound();
  const [linked, allCourses] = await Promise.all([surveyCourseIds(s.id), listCourses({ includeDrafts: true })]);
  return (
    <>
      <PageTitle
        title={s.title}
        sub={s.status === "published" ? "Yayında — değişiklikler öğrencilere anında yansır." : "Taslak — öğrenciler görmez."}
        action={
          <div className="flex items-center gap-2">
            {s.status === "published" ? <Chip color="green">Yayında</Chip> : <Chip color="gray">Taslak</Chip>}
            <PublishSurveyButton id={s.id} published={s.status === "published"} />
            <Link href="/admin/anketler" className="btn-secondary btn-sm">← Anketler</Link>
          </div>
        }
      />
      <SurveyBuilder survey={{ id: s.id, title: s.title, intro: s.intro, mode: s.mode, editable: s.editable, required: s.required, sections: s.sections, questions: s.questions }} />
      <SurveyCourseLinks surveyId={s.id} published={s.status === "published"} initial={linked} courses={allCourses.filter((c) => !c.closed).map((c) => ({ id: c.id, title: c.title, group: c.group, published: c.status === "published" }))} />
    </>
  );
}
