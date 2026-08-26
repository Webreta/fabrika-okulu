import { requireTeacher } from "@/lib/auth/session";
import { listSurveys, getSurveyById } from "@/lib/survey";
import { PageTitle, Tabs } from "@/components/panel/ui";
import { SurveyResults } from "@/components/SurveyResults";

export default async function TeacherSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return <p className="card text-muted">Bu sayfaya yalnızca süper eğitmenler erişebilir.</p>;
  const params = await searchParams;
  const list = await listSurveys();
  if (list.length === 0) return <><PageTitle title="Anket Sonuçları" /><p className="card text-muted">Henüz anket yok.</p></>;
  const selected = (Number(params.anket) ? await getSurveyById(Number(params.anket)) : null) ?? list[0];
  return (
    <>
      <PageTitle title="Anket Sonuçları" />
      <Tabs items={list.map((s) => ({ href: `/egitmen/anketler?anket=${s.id}`, label: s.title, active: s.id === selected.id }))} />
      <SurveyResults survey={selected} base={`/egitmen/anketler?anket=${selected.id}`} params={params} canExport={user.role === "admin"} />
    </>
  );
}
