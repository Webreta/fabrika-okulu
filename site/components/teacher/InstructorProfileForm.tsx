"use client";

import { useFieldId } from "@/components/useFieldId";
import { Toast } from "@/components/Toast";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInstructorProfile, uploadInstructorPhoto } from "@/app/actions/instructor";
import type { SocialLinks } from "@/db/schema";

export type InstructorProfile = { id?: number; userId?: number | null; name: string; title: string; email: string; phone: string; bio: string; photoUrl: string; socialLinks: SocialLinks; active?: boolean };

export function InstructorProfileForm({ profile, admin, users, onDone }: { profile: InstructorProfile | null; admin?: boolean; users?: { id: number; name: string; role?: string }[]; onDone?: (message?: string) => void }) {
  const fid = useFieldId();
  const [p, setP] = useState<InstructorProfile>(profile ?? { name: "", title: "", email: "", phone: "", bio: "", photoUrl: "", socialLinks: {}, active: true, userId: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof InstructorProfile, v: unknown) => setP({ ...p, [k]: v });
  const social = (k: keyof SocialLinks, v: string) => setP({ ...p, socialLinks: { ...p.socialLinks, [k]: v } });
  // Bağlı kullanıcı değişiyorsa rol değişikliği önceden sorulur (öğrenci eğitmen olur; bağı kalkan kullanıcı öğrenciye döner)
  const confirmLink = () => {
    if (!admin) return true;
    const was = profile?.userId ?? null;
    const now = p.userId ?? null;
    if (was === now) return true;
    const lines: string[] = [];
    const u = now ? users?.find((x) => x.id === now) : null;
    if (u && u.role === "student") lines.push(`${u.name} şu an öğrenci. Bu profile bağlanınca eğitmen rolüne geçer ve eğitmen paneline erişir.`);
    if (was) lines.push("Önceki bağlı kullanıcı, başka bir eğitmen profili ya da kendi eğitimi yoksa öğrenci rolüne döner.");
    return lines.length === 0 || confirm(`${lines.join("\n\n")}\n\nDevam edilsin mi?`);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {p.photoUrl ? <img src={p.photoUrl} alt="" className="size-16 rounded-full object-cover" /> : <div className="size-16 rounded-full bg-navy-100" />}
        <label className="btn-secondary btn-sm cursor-pointer">{busy ? "Yükleniyor…" : "Fotoğraf"}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); const fd = new FormData(); fd.append("file", f); const r = await uploadInstructorPhoto(fd); if (r.ok) set("photoUrl", r.url); setBusy(false); }} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={fid("a1")} className="label">Ad Soyad</label><input id={fid("a1")} value={p.name} onChange={(e) => set("name", e.target.value)} maxLength={80} className="input" /></div>
        <div><label htmlFor={fid("a2")} className="label">Unvan</label><input id={fid("a2")} value={p.title} onChange={(e) => set("title", e.target.value)} maxLength={120} className="input" placeholder="Kariyer Danışmanı" /></div>
        <div><label htmlFor={fid("a3")} className="label">E-posta (görünür)</label><input id={fid("a3")} value={p.email} onChange={(e) => set("email", e.target.value)} maxLength={160} className="input" /></div>
        <div><label htmlFor={fid("a4")} className="label">Telefon</label><input id={fid("a4")} value={p.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} className="input" /></div>
        <div><label htmlFor={fid("a5")} className="label">LinkedIn</label><input id={fid("a5")} value={p.socialLinks.linkedin ?? ""} onChange={(e) => social("linkedin", e.target.value)} maxLength={300} className="input" /></div>
        <div><label htmlFor={fid("a6")} className="label">Instagram</label><input id={fid("a6")} value={p.socialLinks.instagram ?? ""} onChange={(e) => social("instagram", e.target.value)} maxLength={300} className="input" /></div>
        <div><label htmlFor={fid("a7")} className="label">Web sitesi</label><input id={fid("a7")} value={p.socialLinks.website ?? ""} onChange={(e) => social("website", e.target.value)} maxLength={300} className="input" /></div>
        <div><label htmlFor={fid("a8")} className="label">X / Twitter</label><input id={fid("a8")} value={p.socialLinks.twitter ?? ""} onChange={(e) => social("twitter", e.target.value)} maxLength={300} className="input" /></div>
        <div className="sm:col-span-2"><label htmlFor={fid("a9")} className="label">Biyografi</label><textarea id={fid("a9")} rows={4} value={p.bio} onChange={(e) => set("bio", e.target.value)} maxLength={5000} className="input" /></div>
        {admin && (
          <>
            <div><label htmlFor={fid("a10")} className="label">Bağlı kullanıcı (eğitmen girişi)</label>
              <select id={fid("a10")} value={p.userId ?? ""} onChange={(e) => set("userId", e.target.value ? Number(e.target.value) : null)} className="input"><option value="">— Yok —</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <p className="text-[11px] text-muted">Bağlanan kullanıcı eğitmen rolü alır; bağı kaldırılan kullanıcı (başka profili ya da kendi eğitimi yoksa) öğrenciye döner.</p>
            </div>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={p.active !== false} onChange={(e) => set("active", e.target.checked)} /> Aktif</label>
          </>
        )}
      </div>
      {msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}
      <button disabled={pending} onClick={() => { if (!confirmLink()) return; start(async () => { const r = await saveInstructorProfile(p); setMsg(r.ok ? "Kaydedildi." : r.error); if (r.ok) { router.refresh(); onDone?.(r.message ? `Kaydedildi. ${r.message}` : undefined); } }); }} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
    </div>
  );
}
