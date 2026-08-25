import { requireTeacher } from "@/lib/auth/session";
import { teacherThreads } from "@/lib/data/teacher";
import { PageTitle } from "@/components/panel/ui";
import { ChatUI } from "@/components/teacher/ChatUI";

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  const user = await requireTeacher();
  const threads = await teacherThreads(user);
  return (
    <>
      <PageTitle title="Sorular" sub={`${threads.filter((t) => t.pending > 0).length} bekleyen sohbet`} />
      <ChatUI initialKey={chat} threads={threads.map((t) => ({ ...t, lastAt: t.lastAt.toISOString(), messages: t.messages.map((m) => ({ ...m, at: m.at.toISOString() })) }))} />
    </>
  );
}
