import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes, courses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { PageTitle, Empty } from "@/components/panel/ui";
import { NotesBrowser } from "@/components/panel/NotesBrowser";

export default async function NotesPage() {
  const user = (await getCurrentUser())!;
  const rows = await db.select({ n: notes, courseTitle: courses.title }).from(notes).leftJoin(courses, eq(notes.courseId, courses.id)).where(eq(notes.userId, user.id)).orderBy(desc(notes.createdAt));
  return (
    <>
      <PageTitle title="Notlarım" sub="Ders içinde aldığın zaman damgalı notlar ve genel notların" />
      {rows.length === 0 ? (
        <Empty text="Henüz notun yok. Ders izlerken 'Notlar' sekmesinden not alabilirsin." />
      ) : (
        <NotesBrowser notes={rows.map(({ n, courseTitle }) => ({ id: n.id, courseId: n.courseId, courseTitle, lessonId: n.lessonId, lessonTitle: n.lessonTitle, seconds: n.seconds, text: n.text, createdAt: n.createdAt.toISOString() }))} />
      )}
    </>
  );
}
