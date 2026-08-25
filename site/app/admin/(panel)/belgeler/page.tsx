import { listDocuments, courseOptions } from "@/lib/data/documents";
import { getSetting } from "@/lib/settings";
import { PageTitle } from "@/components/panel/ui";
import { DocumentsManager } from "@/components/teacher/DocumentsManager";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function AdminDocumentsPage() {
  const [docs, courses, smtp] = await Promise.all([listDocuments(), courseOptions(), getSetting("smtp")]);
  return (
    <>
      <PageTitle title="Belgeler & Kuponlar" sub="Öğrenci/mezun belgeleri; indirim kuponu tanımlama." />
      <div className="mb-6">
        <SettingsForm settingKey="smtp" title="Belge bildirim e-postası" fields={[{ key: "documentsEmail", label: "Yeni belge yüklendiğinde bildirim gidecek adres", type: "text", placeholder: "belge@fabrikaokulu.com.tr" }]} values={smtp as unknown as Record<string, string | number | boolean>} />
      </div>
      <DocumentsManager docs={docs} courses={courses} />
    </>
  );
}
