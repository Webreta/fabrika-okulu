import { requireTeacher } from "@/lib/auth/session";
import { listDocuments, courseOptions } from "@/lib/data/documents";
import { PageTitle } from "@/components/panel/ui";
import { DocumentsManager } from "@/components/teacher/DocumentsManager";

export default async function DocumentsPage() {
  const user = await requireTeacher();
  if (!user.isSuperTeacher) return <p className="card text-muted">Bu sayfaya yalnızca süper eğitmenler erişebilir.</p>;
  const [docs, courses] = await Promise.all([listDocuments(), courseOptions()]);
  return (
    <>
      <PageTitle title="Belgeler & Kuponlar" sub="Öğrenci/mezun belgelerini incele, indirim kuponu tanımla." />
      <DocumentsManager docs={docs} courses={courses} />
    </>
  );
}
