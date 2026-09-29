"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InstructorProfileForm, type InstructorProfile } from "@/components/teacher/InstructorProfileForm";
import { deleteInstructor } from "@/app/actions/instructor";
import { initials } from "@/lib/format";
import { Chip } from "@/components/panel/ui";
import { Icon } from "@/components/site/Icon";

type Row = InstructorProfile & { id: number; courseCount: number; userLabel: string | null };

export function InstructorsManager({ list, users }: { list: Row[]; users: { id: number; name: string; role?: string }[] }) {
  const [edit, setEdit] = useState<InstructorProfile | null | "new">(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const remove = (i: Row) => {
    const text = `"${i.name}" eğitmen profili silinsin mi?` + (i.userLabel
      ? `\n\nBağlı kullanıcı (${i.userLabel}) eğitmen paneline erişimini kaybeder ve öğrenci rolüne döner. Yöneticiyse, başka bir eğitmen profiline bağlıysa ya da kendi eğitimi varsa rolü değişmez.`
      : "");
    if (!confirm(text)) return;
    start(async () => {
      const r = await deleteInstructor(i.id);
      setNote({ ok: r.ok, text: r.ok ? r.message ?? "Eğitmen profili silindi." : r.error });
      router.refresh();
    });
  };
  return (
    <div className="space-y-4">
      {note && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${note.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{note.text}</p>}
      <div className="flex justify-end"><button onClick={() => setEdit("new")} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> Yeni eğitmen</button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.length === 0 && <p className="card text-muted">Henüz eğitmen yok.</p>}
        {list.map((i) => (
          <div key={i.id} className="card">
            <div className="flex items-start justify-between">
              <Chip color={i.active ? "green" : "gray"}>{i.active ? "Aktif" : "Pasif"}</Chip>
              <div className="flex gap-1">
                <button aria-label="Düzenle" onClick={() => setEdit(i)} className="rounded p-1.5 hover:bg-surface"><Icon name="edit" className="size-4" /></button>
                <button disabled={pending} onClick={() => remove(i)} aria-label="Sil" className="rounded p-1.5 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              {i.photoUrl ? <img src={i.photoUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" /> : <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-navy-100 font-bold text-navy-800">{initials(i.name)}</div>}
              <div className="min-w-0 break-words"><p className="font-bold text-navy-800">{i.name}</p><p className="text-sm text-sky-600">{i.title}</p></div>
            </div>
            {i.bio && <p className="mt-3 line-clamp-3 text-sm text-muted">{i.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-2 break-all text-xs text-muted">
              {i.email && <span>✉ {i.email}</span>}{i.phone && <span>☎ {i.phone}</span>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
              <span className="text-muted">{i.courseCount} kurs</span>
              {i.userLabel ? <Chip color="sky">Eğitmen · {i.userLabel}</Chip> : <Chip color="gray">Kullanıcıya bağlı değil</Chip>}
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-navy-800">{edit === "new" ? "Yeni eğitmen" : "Eğitmeni düzenle"}</h3>
            <InstructorProfileForm profile={edit === "new" ? null : edit} admin users={users} onDone={(m) => { setEdit(null); if (m) setNote({ ok: true, text: m }); }} />
          </div>
        </div>
      )}
    </div>
  );
}
