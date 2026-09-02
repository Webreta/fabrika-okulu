import Link from "next/link";
import { notFound } from "next/navigation";
import { getSurveyById } from "@/lib/survey";
import { PageTitle, Chip } from "@/components/panel/ui";
import { SurveyBuilder } from "@/components/admin/SurveyBuilder";
import { PublishSurveyButton } from "@/components/admin/SurveyAdminButtons";

export default async function AdminSurveyEditPage({ params }: { params: Promise<{ id: string }> }) {
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
      <SurveyBuilder survey={{ id: s.id, title: s.title, intro: s.intro, mode: s.mode, editable: s.editable, sections: s.sections, questions: s.questions }} />
    </>
  );
}
