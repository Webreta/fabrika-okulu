import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { resumeFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDate } from "@/lib/format";
import { RESUME_KINDS, fmtBytes } from "@/lib/resume-kinds";
import { Icon } from "@/components/site/Icon";
import { ResumeUploadForm, DeleteResumeFileButton } from "@/components/panel/ResumeFiles";

/** Tercihler → Özgeçmişim: CV ve sertifika/başarı/katılım belgeleri, tür başına 50 MB */
export default async function ResumePage() {
  const user = (await getCurrentUser())!;
  const files = await db.select().from(resumeFiles).where(eq(resumeFiles.userId, user.id)).orderBy(desc(resumeFiles.createdAt));
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Özgeçmişim</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        {RESUME_KINDS.map((k) => {
          const list = files.filter((f) => f.kind === k.key);
          const used = list.reduce((s, f) => s + f.size, 0);
          return (
            <div key={k.key} className="card">
              <h3 className="font-bold text-navy-800">{k.title}</h3>
              <p className="mb-4 text-xs text-muted">{k.hint}</p>
              <ResumeUploadForm kind={k.key} used={used} />
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {list.length === 0 && <li className="py-3 text-sm text-muted">Henüz dosya yok.</li>}
                {list.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-navy-800"><Icon name="doc" className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <a href={f.fileUrl} target="_blank" rel="noopener" className="block truncate text-sm font-semibold text-navy-800 hover:underline">{f.fileName}</a>
                      <p className="text-xs text-muted">{fmtBytes(f.size)} · <span className="date-chip">{fmtDate(f.createdAt)}</span></p>
                    </div>
                    <a href={f.fileUrl} download className="rounded p-1.5 text-muted hover:bg-surface" title="İndir"><Icon name="download" className="size-4" /></a>
                    <DeleteResumeFileButton id={f.id} name={f.fileName} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
