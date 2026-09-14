"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { savePrerequisites, type PrereqInput } from "@/app/actions/prerequisites";
import { Icon } from "@/components/site/Icon";
import { Toast } from "@/components/Toast";

type CourseOpt = { id: number; title: string; imageUrl: string; group: string; status: string };
type Cond = "enrolled" | "completed";
type Link = { requiredCourseId: number; condition: Cond };

const GROUP: Record<string, string> = { takvimli: "Takvimli", esnek: "Esnek", ucretsiz: "Ücretsiz" };

/**
 * Satın alım koşulları: ürün ağacı editörü.
 * Her eğitimin en fazla bir üst basamağı vardır (ağaç). Bir eğitimi başka bir eğitimin üzerine sürükleyince onun altına bağlanır:
 * üst basamak alınmadan (ya da tamamlanmadan) alt basamak satın alınamaz. Bağı çözmek için "Ayır" ya da soldaki havuza sürükle.
 */
export function PrerequisitesManager({ courses, initial }: { courses: CourseOpt[]; initial: PrereqInput[] }) {
  const [links, setLinks] = useState<Map<number, Link>>(() => new Map(initial.map((l) => [l.courseId, { requiredCourseId: l.requiredCourseId, condition: l.condition }])));
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | "pool" | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const children = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const [cid, l] of links) m.set(l.requiredCourseId, [...(m.get(l.requiredCourseId) ?? []), cid]);
    for (const arr of m.values()) arr.sort((a, b) => (byId.get(a)?.title ?? "").localeCompare(byId.get(b)?.title ?? "", "tr"));
    return m;
  }, [links, byId]);
  // Havuz: ne üstü ne altı olan bağımsız eğitimler; ağaçlar: alt basamağı olan kökler
  const roots = courses.filter((c) => !links.has(c.id) && (children.get(c.id)?.length ?? 0) > 0);
  const pool = courses.filter((c) => !links.has(c.id) && !(children.get(c.id)?.length) && c.title.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  const isDescendant = (candidate: number, of: number): boolean => {
    // candidate, of'un altında mı? (kendisi dahil)
    if (candidate === of) return true;
    return (children.get(of) ?? []).some((k) => isDescendant(candidate, k));
  };
  const update = (fn: (m: Map<number, Link>) => void) => { const m = new Map(links); fn(m); setLinks(m); setDirty(true); };
  const attach = (childId: number, parentId: number) => {
    if (childId === parentId || isDescendant(parentId, childId)) return; // kendine ya da kendi altına bağlanamaz
    update((m) => m.set(childId, { requiredCourseId: parentId, condition: m.get(childId)?.condition ?? "enrolled" }));
  };
  const detach = (id: number) => update((m) => { m.delete(id); });
  const setCond = (id: number, condition: Cond) => update((m) => { const l = m.get(id); if (l) m.set(id, { ...l, condition }); });

  const onDrop = (target: number | "pool") => {
    if (dragId === null) return;
    if (target === "pool") detach(dragId); else attach(dragId, target);
    setDragId(null); setOverId(null);
  };
  const dragProps = (id: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  });
  const dropProps = (target: number | "pool") => ({
    onDragOver: (e: React.DragEvent) => { if (dragId === null) return; if (target !== "pool" && (dragId === target || isDescendant(target, dragId))) return; e.preventDefault(); setOverId(target); },
    onDragLeave: () => setOverId((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop(target); },
  });

  const save = () => start(async () => {
    const r = await savePrerequisites([...links].map(([courseId, l]) => ({ courseId, requiredCourseId: l.requiredCourseId, condition: l.condition })));
    setMsg(r.ok ? r.message ?? "Kaydedildi." : r.error);
    if (r.ok) { setDirty(false); router.refresh(); }
  });

  const Node = ({ id, depth }: { id: number; depth: number }) => {
    const c = byId.get(id); if (!c) return null;
    const link = links.get(id);
    const kids = children.get(id) ?? [];
    const isOver = overId === id && dragId !== null && dragId !== id;
    const candidates = courses.filter((k) => k.id !== id && !isDescendant(k.id, id) && links.get(k.id)?.requiredCourseId !== id);
    return (
      <li className="relative">
        {depth > 0 && <span className="absolute -left-4 top-6 h-px w-4 bg-navy-200" />}
        <div {...dragProps(id)} {...dropProps(id)} className={`flex flex-wrap items-center gap-2 rounded-xl border-2 bg-white p-2 pr-3 shadow-sm transition ${isOver ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200" : dragId === id ? "border-dashed border-navy-300 opacity-50" : depth === 0 ? "border-navy-800" : "border-line"}`}>
          <span className="cursor-grab text-navy-300 active:cursor-grabbing" title="Sürükle"><Icon name="grip" className="size-4" /></span>
          <div className="h-8 w-14 shrink-0 overflow-hidden rounded bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={56} height={32} className="h-full w-full object-cover" />}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy-800">{depth === 0 && <Icon name="star" className="mr-1 inline size-3.5 text-amber-500" />}{c.title}</p>
            <p className="text-[11px] text-muted">{GROUP[c.group] ?? c.group}{c.status !== "published" && " · taslak"}{kids.length > 0 && ` · ${kids.length} alt eğitim`}</p>
          </div>
          {link && (
            <select value={link.condition} onChange={(e) => setCond(id, e.target.value as Cond)} className="input h-8 w-auto py-0 text-xs" title="Üst basamak için koşul">
              <option value="enrolled">Üst eğitim satın alınmış olmalı</option>
              <option value="completed">Üst eğitim tamamlanmış olmalı</option>
            </select>
          )}
          <select value="" onChange={(e) => { const v = Number(e.target.value); if (v) attach(v, id); }} className="input h-8 w-auto max-w-44 py-0 text-xs" title="Bu eğitimin altına eğitim ekle">
            <option value="">+ Alt eğitim ekle…</option>
            {candidates.map((k) => <option key={k.id} value={k.id}>{k.title}{links.has(k.id) ? " (taşı)" : ""}</option>)}
          </select>
          {link && <button type="button" onClick={() => detach(id)} className="text-xs font-semibold text-red-600 hover:underline" title="Üst basamaktan ayır (alt eğitimler bu eğitimle kalır)">Ayır</button>}
        </div>
        {kids.length > 0 && (
          <ul className="ml-6 mt-2 space-y-2 border-l-2 border-navy-200 pl-4">
            {kids.map((k) => <Node key={k} id={k} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  const summary = [...links].map(([cid, l]) => ({ child: byId.get(cid)?.title ?? cid, parent: byId.get(l.requiredCourseId)?.title ?? l.requiredCourseId, cond: l.condition }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-semibold text-amber-600">Kaydedilmemiş değişiklik var</span>}
          <button disabled={pending || !dirty} onClick={save} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
        </div>
      </div>
      {msg && <Toast message={msg} ok={msg.includes("kaydedildi")} onDone={() => setMsg("")} />}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside {...dropProps("pool")} className={`card h-fit space-y-2 transition lg:sticky lg:top-6 ${overId === "pool" && dragId !== null ? "ring-2 ring-sky-300" : ""}`}>
          <p className="font-bold text-navy-800">Bağımsız eğitimler</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="Ara…" />
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {pool.length === 0 && <li className="py-4 text-center text-xs text-muted">Eğitim yok</li>}
            {pool.map((c) => (
              <li key={c.id} {...dragProps(c.id)} className={`flex cursor-grab items-center gap-2 rounded-lg border border-line bg-white p-1.5 text-sm active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}>
                <Icon name="grip" className="size-4 shrink-0 text-navy-300" />
                <div className="h-7 w-12 shrink-0 overflow-hidden rounded bg-navy-50">{c.imageUrl && <Image src={c.imageUrl} alt="" width={48} height={28} className="h-full w-full object-cover" />}</div>
                <span className="min-w-0 flex-1 truncate font-medium text-navy-800">{c.title}</span>
                <select value="" onChange={(e) => { const v = Number(e.target.value); if (v) attach(c.id, v); }} className="input h-7 w-7 shrink-0 px-1 py-0 text-xs" title="Bir eğitimin altına bağla">
                  <option value="">→</option>
                  {courses.filter((k) => k.id !== c.id).map((k) => <option key={k.id} value={k.id}>{k.title} altına</option>)}
                </select>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-6">
          {roots.length === 0 ? (
            <div className="card flex min-h-64 flex-col items-center justify-center text-center">
              <Icon name="layers" className="size-10 text-navy-300" />
              <p className="mt-2 font-semibold text-navy-800">Henüz ürün ağacı yok</p>
              <p className="mt-1 max-w-sm text-sm text-muted">Soldan bir eğitimi başka bir eğitimin üzerine sürükle ya da satırdaki ok menüsünden "altına bağla" seç.</p>
            </div>
          ) : (
            roots.map((r) => (
              <div key={r.id} className="card">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"><Icon name="star" className="mr-1 inline size-3.5 text-amber-500" /> Ürün ağacı · kök: {r.title}</p>
                <ul className="space-y-2"><Node id={r.id} depth={0} /></ul>
              </div>
            ))
          )}
          {summary.length > 0 && (
            <div className="card">
              <p className="font-bold text-navy-800">Koşul özeti</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {summary.map((s, i) => <li key={i}><span className="font-semibold text-navy-800">{s.parent}</span> {s.cond === "completed" ? "tamamlanmadan" : "alınmadan"} <span className="font-semibold text-navy-800">{s.child}</span> satın alınamaz.</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
