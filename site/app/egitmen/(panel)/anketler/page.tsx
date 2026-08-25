import { requireTeacher } from "@/lib/auth/session";
import { PageTitle } from "@/components/panel/ui";
import { SurveyResults } from "@/components/SurveyResults";

export default async function TeacherSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return <p className="card text-muted">Bu sayfaya yalnızca süper eğitmenler erişebilir.</p>;
  const params = await searchParams;
  return (
    <>
      <PageTitle title="Anket Sonuçları" />
      <SurveyResults base="/egitmen/anketler" params={params} canExport={user.role === "admin"} />
    </>
  );
}
