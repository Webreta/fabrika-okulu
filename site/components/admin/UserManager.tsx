"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUser, deleteUser } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { fmtDate } from "@/lib/format";
import { Chip } from "@/components/panel/ui";
import { LIMITS } from "@/lib/limits";

type U = { id: number; email: string; firstName: string; lastName: string; phone: string; role: "admin" | "teacher" | "student"; isSuperTeacher: boolean; active: boolean; createdAt: string };
const ROLE: Record<U["role"], { l: string; c: "red" | "sky" | "gray" }> = { admin: { l: "Yönetici", c: "red" }, teacher: { l: "Eğitmen", c: "sky" }, student: { l: "Öğrenci", c: "gray" } };

export function UserManager({ users, meId }: { users: U[]; meId: number }) {
  const [edit, setEdit] = useState<U | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  // Düzenleme penceresindeki hata (pencere açık kalır, yazılanlar kaybolmaz)
  const [editErr, setEditErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  // Yeni kullanıcı formu: alanlar kontrollü ve form elle gönderilir; hata verince yazılanlar silinmez
  const EMPTY_NEW = { firstName: "", lastName: "", email: "", password: "", role: "student", isSuper: false };
  const [nu, setNu] = useState(EMPTY_NEW);
  const [state, action, creating] = useActionState<FormState, FormData>(async (p, fd) => { const r = await createUser(p, fd); if (r.ok) { setShowNew(false); setNu(EMPTY_NEW); setErr(false); setMsg(r.ok); router.refresh(); } return r; }, {});
  const [, startCreate] = useTransition();
  const submitNew = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startCreate(() => action(fd));
  };
  const [pw, setPw] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {msg ? <p role="status" className={`rounded-lg px-3 py-1.5 text-sm ${err ? "bg-red-50 text-red-700" : "bg-sky-50"}`}>{msg}</p> : <span />}
        <button onClick={() => setShowNew(!showNew)} className="btn-primary btn-sm">+ Yeni kullanıcı</button>
      </div>
      {showNew && (
        <form onSubmit={submitNew} className="card grid gap-3 sm:grid-cols-3">
          <input name="firstName" aria-label="Ad" placeholder="Ad" required maxLength={LIMITS.firstName} value={nu.firstName} onChange={(e) => setNu({ ...nu, firstName: e.target.value })} className="input" />
          <input name="lastName" aria-label="Soyad" placeholder="Soyad" maxLength={LIMITS.lastName} value={nu.lastName} onChange={(e) => setNu({ ...nu, lastName: e.target.value })} className="input" />
          <input name="email" type="email" aria-label="E-posta" placeholder="E-posta" required maxLength={LIMITS.email} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} className="input" />
          <input name="password" type="text" aria-label="Şifre" placeholder="Şifre (en az 8 karakter)" required minLength={8} maxLength={LIMITS.password} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} className="input" />
          <select name="role" aria-label="Rol" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} className="input"><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="super" value="1" checked={nu.isSuper} onChange={(e) => setNu({ ...nu, isSuper: e.target.checked })} /> Süper eğitmen</label>
          {state.error && <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p>}
          <button disabled={creating} className="btn-primary sm:col-span-3">{creating ? "…" : "Oluştur"}</button>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Üyelik</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="max-w-xs break-words"><p className="font-semibold text-navy-800">{u.firstName} {u.lastName}</p><p className="text-xs text-muted">{u.email}{u.phone && ` · ${u.phone}`}</p></td>
                <td><Chip color={ROLE[u.role].c}>{ROLE[u.role].l}</Chip> {u.isSuperTeacher && u.role !== "admin" && <Chip color="amber">★ Süper</Chip>}</td>
                <td>{u.active ? <Chip color="green">Aktif</Chip> : <Chip color="gray">Pasif</Chip>}</td>
                <td className="text-xs">{fmtDate(u.createdAt)}</td>
                <td className="flex gap-2"><button onClick={() => { setEdit(u); setPw(""); setEditErr(""); }} className="btn-secondary btn-sm">Düzenle</button><Link href={`/admin/ogrenciler?detail=${u.id}`} className="btn-secondary btn-sm">Eğitimler</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="break-words font-bold text-navy-800">{edit.email}</p>
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Ad" value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} maxLength={LIMITS.firstName} className="input" placeholder="Ad" />
              <input aria-label="Soyad" value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} maxLength={LIMITS.lastName} className="input" placeholder="Soyad" />
              <input aria-label="Telefon" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} maxLength={LIMITS.phone} className="input" placeholder="Telefon" />
              <select aria-label="Rol" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as U["role"] })} disabled={edit.id === meId} className="input"><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isSuperTeacher} onChange={(e) => setEdit({ ...edit, isSuperTeacher: e.target.checked })} /> Süper eğitmen (duyuru, belge/kupon, anket sonuçları)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} disabled={edit.id === meId} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Hesap aktif</label>
            <input aria-label="Yeni şifre" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={LIMITS.password} className="input" placeholder="Yeni şifre (en az 8 karakter; boş bırak = değişmez)" />
            {editErr && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editErr}</p>}
            <div className="flex justify-between">
              <button disabled={pending || edit.id === meId} onClick={() => { if (confirm(`${edit.email} hesabı kalıcı olarak silinecek.\n\nBirlikte silinenler: eğitim kayıtları ve ilerlemesi, sınav ve görev gönderimleri, soruları, notları, hedef testi cevapları, yüklediği belgeler, kişiye özel kuponları, favorileri ve bildirimleri.\n\nSiparişi ya da sertifikası olan hesap silinmez; onun yerine "Hesap aktif" işaretini kaldırıp pasif yap.\n\nBu işlem geri alınamaz. Devam edilsin mi?`)) start(async () => { const r = await deleteUser(edit.id); if (r.ok) { setMsg(r.message ?? "Silindi"); setErr(false); setEdit(null); router.refresh(); } else setEditErr(r.error); }); }} className="text-sm text-red-600">Sil</button>
              <div className="flex gap-2">
                <button onClick={() => setEdit(null)} className="btn-secondary btn-sm">Vazgeç</button>
                <button disabled={pending} onClick={() => start(async () => { const r = await updateUser(edit.id, { firstName: edit.firstName, lastName: edit.lastName, phone: edit.phone, role: edit.role, isSuperTeacher: edit.isSuperTeacher, active: edit.active, password: pw || undefined }); if (r.ok) { setMsg(r.message ?? "Kaydedildi"); setErr(false); setEdit(null); router.refresh(); } else setEditErr(r.error); })} className="btn-primary btn-sm">Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
