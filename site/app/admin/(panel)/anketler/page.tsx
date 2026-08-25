import { getSurveySchema } from "@/lib/survey";
import { getSetting } from "@/lib/settings";
import { PageTitle, Tabs } from "@/components/panel/ui";
import { SurveyResults } from "@/components/SurveyResults";
import { SurveySchemaEditor } from "@/components/admin/SurveySchemaEditor";

export default async function AdminSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const tab = params.sekme === "tanim" ? "tanim" : "sonuc";
  return (
    <>
      <PageTitle title="Anketler" />
      <Tabs items={[{ href: "/admin/anketler", label: "Sonuçlar", active: tab === "sonuc" }, { href: "/admin/anketler?sekme=tanim", label: "Anket Tanımı", active: tab === "tanim" }]} />
      {tab === "sonuc" ? <SurveyResults base="/admin/anketler" params={params} canExport /> : <SurveySchemaEditor schema={await getSurveySchema()} required={(await getSetting("panel")).surveyRequired} />}
    </>
  );
}
