import Link from "next/link";
import { notFound } from "next/navigation";
import { getSurveyById } from "@/lib/survey";
import { PageTitle, Chip } from "@/components/panel/ui";
import { SurveySchemaEditor } from "@/components/admin/SurveySchemaEditor";
import { PublishSurveyButton } from "@/components/admin/SurveyAdminButtons";

export default async function AdminSurveyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "yeni") {
    return (
      <>
        <PageTitle title="Yeni anket" action={<Link href="/admin/anketler" className="btn-secondary btn-sm">← Anketler</Link>} />
        <SurveySchemaEditor survey={{ title: "", intro: "", sections: { genel: "Genel" }, questions: [] }} />
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
      <SurveySchemaEditor survey={{ id: s.id, title: s.title, intro: s.intro, sections: s.sections, questions: s.questions }} />
    </>
  );
}
