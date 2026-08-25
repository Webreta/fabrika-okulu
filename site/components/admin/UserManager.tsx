"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUser, deleteUser } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { fmtDate } from "@/lib/format";
import { Chip } from "@/components/panel/ui";

type U = { id: number; email: string; firstName: string; lastName: string; phone: string; role: "admin" | "teacher" | "student"; isSuperTeacher: boolean; active: boolean; createdAt: string };
const ROLE: Record<U["role"], { l: string; c: "red" | "sky" | "gray" }> = { admin: { l: "Yönetici", c: "red" }, teacher: { l: "Eğitmen", c: "sky" }, student: { l: "Öğrenci", c: "gray" } };

export function UserManager({ users, meId }: { users: U[]; meId: number }) {
  const [edit, setEdit] = useState<U | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [state, action, creating] = useActionState<FormState, FormData>(async (p, fd) => { const r = await createUser(p, fd); if (r.ok) { setShowNew(false); router.refresh(); } return r; }, {});
  const [pw, setPw] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {msg ? <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm">{msg}</p> : <span />}
        <button onClick={() => setShowNew(!showNew)} className="btn-primary btn-sm">+ Yeni kullanıcı</button>
      </div>
      {showNew && (
        <form action={action} className="card grid gap-3 sm:grid-cols-3">
          <input name="firstName" placeholder="Ad" required className="input" />
          <input name="lastName" placeholder="Soyad" className="input" />
          <input name="email" type="email" placeholder="E-posta" required className="input" />
          <input name="password" type="text" placeholder="Şifre (min 6)" required className="input" />
          <select name="role" className="input"><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="super" value="1" /> Süper eğitmen</label>
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
                <td><p className="font-semibold text-navy-800">{u.firstName} {u.lastName}</p><p className="text-xs text-muted">{u.email}{u.phone && ` · ${u.phone}`}</p></td>
                <td><Chip color={ROLE[u.role].c}>{ROLE[u.role].l}</Chip> {u.isSuperTeacher && u.role !== "admin" && <Chip color="amber">★ Süper</Chip>}</td>
                <td>{u.active ? <Chip color="green">Aktif</Chip> : <Chip color="gray">Pasif</Chip>}</td>
                <td className="text-xs">{fmtDate(u.createdAt)}</td>
                <td className="flex gap-2"><button onClick={() => { setEdit(u); setPw(""); }} className="btn-secondary btn-sm">Düzenle</button><Link href={`/admin/ogrenciler?detail=${u.id}`} className="btn-secondary btn-sm">Eğitimler</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-navy-800">{edit.email}</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} className="input" placeholder="Ad" />
              <input value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} className="input" placeholder="Soyad" />
              <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="input" placeholder="Telefon" />
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as U["role"] })} disabled={edit.id === meId} className="input"><option value="student">Öğrenci</option><option value="teacher">Eğitmen</option><option value="admin">Yönetici</option></select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isSuperTeacher} onChange={(e) => setEdit({ ...edit, isSuperTeacher: e.target.checked })} /> Süper eğitmen (duyuru, belge/kupon, anket sonuçları)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} disabled={edit.id === meId} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Hesap aktif</label>
            <input value={pw} onChange={(e) => setPw(e.target.value)} className="input" placeholder="Yeni şifre (boş bırak = değişmez)" />
            <div className="flex justify-between">
              <button disabled={pending || edit.id === meId} onClick={() => { if (confirm("Kullanıcı ve tüm verileri silinecek. Emin misin?")) start(async () => { const r = await deleteUser(edit.id); setMsg(r.ok ? "Silindi" : r.error); setEdit(null); router.refresh(); }); }} className="text-sm text-red-600">Sil</button>
              <div className="flex gap-2">
                <button onClick={() => setEdit(null)} className="btn-secondary btn-sm">Vazgeç</button>
                <button disabled={pending} onClick={() => start(async () => { const r = await updateUser(edit.id, { firstName: edit.firstName, lastName: edit.lastName, phone: edit.phone, role: edit.role, isSuperTeacher: edit.isSuperTeacher, active: edit.active, password: pw || undefined }); setMsg(r.ok ? r.message ?? "Kaydedildi" : r.error); if (r.ok) setEdit(null); router.refresh(); })} className="btn-primary btn-sm">Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
