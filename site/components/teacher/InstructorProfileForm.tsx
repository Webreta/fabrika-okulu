"use client";

import { Toast } from "@/components/Toast";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInstructorProfile, uploadInstructorPhoto } from "@/app/actions/instructor";
import type { SocialLinks } from "@/db/schema";

export type InstructorProfile = { id?: number; userId?: number | null; name: string; title: string; email: string; phone: string; bio: string; photoUrl: string; socialLinks: SocialLinks; active?: boolean };

export function InstructorProfileForm({ profile, admin, users, onDone }: { profile: InstructorProfile | null; admin?: boolean; users?: { id: number; name: string }[]; onDone?: () => void }) {
  const [p, setP] = useState<InstructorProfile>(profile ?? { name: "", title: "", email: "", phone: "", bio: "", photoUrl: "", socialLinks: {}, active: true, userId: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof InstructorProfile, v: unknown) => setP({ ...p, [k]: v });
  const social = (k: keyof SocialLinks, v: string) => setP({ ...p, socialLinks: { ...p.socialLinks, [k]: v } });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {p.photoUrl ? <img src={p.photoUrl} alt="" className="size-16 rounded-full object-cover" /> : <div className="size-16 rounded-full bg-navy-100" />}
        <label className="btn-secondary btn-sm cursor-pointer">{busy ? "Yükleniyor…" : "Fotoğraf"}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); const fd = new FormData(); fd.append("file", f); const r = await uploadInstructorPhoto(fd); if (r.ok) set("photoUrl", r.url); setBusy(false); }} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Ad Soyad</label><input value={p.name} onChange={(e) => set("name", e.target.value)} className="input" /></div>
        <div><label className="label">Unvan</label><input value={p.title} onChange={(e) => set("title", e.target.value)} className="input" placeholder="Kariyer Danışmanı" /></div>
        <div><label className="label">E-posta (görünür)</label><input value={p.email} onChange={(e) => set("email", e.target.value)} className="input" /></div>
        <div><label className="label">Telefon</label><input value={p.phone} onChange={(e) => set("phone", e.target.value)} className="input" /></div>
        <div><label className="label">LinkedIn</label><input value={p.socialLinks.linkedin ?? ""} onChange={(e) => social("linkedin", e.target.value)} className="input" /></div>
        <div><label className="label">Instagram</label><input value={p.socialLinks.instagram ?? ""} onChange={(e) => social("instagram", e.target.value)} className="input" /></div>
        <div><label className="label">Web sitesi</label><input value={p.socialLinks.website ?? ""} onChange={(e) => social("website", e.target.value)} className="input" /></div>
        <div><label className="label">X / Twitter</label><input value={p.socialLinks.twitter ?? ""} onChange={(e) => social("twitter", e.target.value)} className="input" /></div>
        <div className="sm:col-span-2"><label className="label">Biyografi</label><textarea rows={4} value={p.bio} onChange={(e) => set("bio", e.target.value)} className="input" /></div>
        {admin && (
          <>
            <div><label className="label">Bağlı kullanıcı (eğitmen girişi)</label>
              <select value={p.userId ?? ""} onChange={(e) => set("userId", e.target.value ? Number(e.target.value) : null)} className="input"><option value="">— Yok —</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <p className="text-[11px] text-muted">Bağlanan kullanıcı eğitmen rolü alır.</p>
            </div>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={p.active !== false} onChange={(e) => set("active", e.target.checked)} /> Aktif</label>
          </>
        )}
      </div>
      {msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}
      <button disabled={pending} onClick={() => start(async () => { const r = await saveInstructorProfile(p); setMsg(r.ok ? "Kaydedildi." : r.error); if (r.ok) { router.refresh(); onDone?.(); } })} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
    </div>
  );
}
