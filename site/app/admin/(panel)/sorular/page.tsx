import { requireAdmin } from "@/lib/auth/session";
import { teacherThreads } from "@/lib/data/teacher";
import { PageTitle, Kpi } from "@/components/panel/ui";
import { ChatUI } from "@/components/teacher/ChatUI";
import { Icon } from "@/components/site/Icon";

export default async function AdminQuestionsPage({ searchParams }: { searchParams: Promise<{ chat?: string; durum?: string }> }) {
  const { chat, durum } = await searchParams;
  const user = await requireAdmin();
  const all = await teacherThreads(user);
  const threads = durum === "pending" ? all.filter((t) => t.pending > 0) : durum === "answered" ? all.filter((t) => t.pending === 0) : all;
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Öğrenci Soruları" sub="Tüm kurslardaki soru sohbetleri" />
        <a
          href={`/api/admin/disa-aktar/sorular${durum ? `?durum=${durum}` : ""}`}
          className="btn-primary flex shrink-0 items-center gap-2"
        >
          <Icon name="download" className="size-4" /> Excel indir
        </a>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-4">
        <a href="/admin/sorular?durum=pending"><Kpi label="Bekleyen sohbet" value={all.filter((t) => t.pending > 0).length} icon="alert" color="amber" /></a>
        <a href="/admin/sorular?durum=answered"><Kpi label="Cevaplanan" value={all.filter((t) => t.pending === 0).length} icon="check" color="green" /></a>
        <a href="/admin/sorular"><Kpi label="Toplam" value={all.length} icon="message" /></a>
      </div>
      <ChatUI initialKey={chat} isAdmin threads={threads.map((t) => ({ ...t, lastAt: t.lastAt.toISOString(), messages: t.messages.map((m) => ({ ...m, at: m.at.toISOString() })) }))} />
    </>
  );
}
