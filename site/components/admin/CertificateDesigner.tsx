"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CertFields, CertField, CertRule } from "@/db/schema";
import { saveCertificateTemplate, deleteCertificateTemplate, duplicateCertificateTemplate, uploadCertificateImage } from "@/app/actions/admin";
import { CERT_FONTS, CERT_CONDITIONS } from "@/lib/certificates";
import { CertificateCanvas } from "@/components/CertificateCanvas";
import { Icon } from "@/components/site/Icon";

type T = { id?: number; title: string; imageUrl: string; imageWidth: number; imageHeight: number; fields: CertFields; rule: CertRule; sampleName: string; sampleCourse: string };
type Block = "name" | "course" | "date" | "qr";

export function CertificateDesigner({ initial, courses }: { initial: T; courses: { id: number; title: string }[] }) {
  const [t, setT] = useState<T>(initial);
  const [sel, setSel] = useState<Block>("name");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Block | null>(null);

  const setField = (b: Exclude<Block, "qr">, patch: Partial<CertField>) => setT({ ...t, fields: { ...t.fields, [b]: { ...t.fields[b], ...patch } } });
  const setQr = (patch: Partial<CertFields["qr"]>) => setT({ ...t, fields: { ...t.fields, qr: { ...t.fields.qr, ...patch } } });

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)) * 10) / 10;
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) * 10) / 10;
    if (drag.current === "qr") setQr({ x, y }); else setField(drag.current, { x, y });
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const r = await uploadCertificateImage(fd);
    if (r.ok) {
      const img = new Image();
      img.onload = () => { setT((x) => ({ ...x, imageUrl: r.url, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight })); setBusy(false); };
      img.onerror = () => { setT((x) => ({ ...x, imageUrl: r.url })); setBusy(false); };
      img.src = r.url;
    } else { setMsg(r.error); setBusy(false); }
  };

  const f = sel === "qr" ? null : t.fields[sel];
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const fakeQr = t.fields.qr.enabled
    ? "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/><rect x="6" y="6" width="1" height="1"/><rect x="8" y="8" width="1" height="1"/></svg>')
    : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="card">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className="label">Başlık</label><input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} className="input" placeholder="Katılım Sertifikası" /></div>
            <div><label className="label">Şablon görseli</label><label className="btn-secondary btn-sm cursor-pointer">{busy ? "…" : "Görsel yükle"}<input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label></div>
            <div><label className="label">Örnek ad</label><input value={t.sampleName} onChange={(e) => setT({ ...t, sampleName: e.target.value })} className="input" /></div>
            <div><label className="label">Örnek eğitim</label><input value={t.sampleCourse} onChange={(e) => setT({ ...t, sampleCourse: e.target.value })} className="input" /></div>
            <div className="text-xs text-muted self-end">Görsel: {t.imageWidth}×{t.imageHeight}px. Metinleri sürükleyerek konumlandır.</div>
          </div>
        </div>
        <div ref={canvasRef} className="relative cursor-crosshair overflow-hidden rounded-xl border border-line shadow" onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <CertificateCanvas imageUrl={t.imageUrl} imageWidth={t.imageWidth} imageHeight={t.imageHeight} fields={t.fields} name={t.sampleName} course={t.sampleCourse} date={today} qrDataUrl={fakeQr} />
          {(["name", "course", "date", "qr"] as Block[]).map((b) => {
            const p = b === "qr" ? t.fields.qr : t.fields[b];
            if (b === "date" && !t.fields.date?.enabled) return null;
            if (b === "qr" && !t.fields.qr.enabled) return null;
            return (
              <button key={b} onPointerDown={(e) => { e.preventDefault(); setSel(b); drag.current = b; }} className={`absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${sel === b ? "border-sky-500 bg-sky-300/60" : "border-white bg-navy-800/50"}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={b} />
            );
          })}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card">
          <div className="mb-3 flex gap-1">
            {(["name", "course", "date", "qr"] as Block[]).map((b) => <button key={b} onClick={() => setSel(b)} className={`rounded-full px-3 py-1 text-xs font-semibold ${sel === b ? "bg-navy-800 text-white" : "bg-surface text-muted"}`}>{{ name: "Ad", course: "Eğitim", date: "Tarih", qr: "QR" }[b]}</button>)}
          </div>
          {sel === "qr" ? (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={t.fields.qr.enabled} onChange={(e) => setQr({ enabled: e.target.checked })} /> QR kodu göster (doğrulama adresi)</label>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">X %</label><input type="number" value={t.fields.qr.x} onChange={(e) => setQr({ x: Number(e.target.value) })} className="input" /></div>
                <div><label className="label">Y %</label><input type="number" value={t.fields.qr.y} onChange={(e) => setQr({ y: Number(e.target.value) })} className="input" /></div>
                <div><label className="label">Boyut px</label><input type="number" min={40} max={600} value={t.fields.qr.size} onChange={(e) => setQr({ size: Number(e.target.value) })} className="input" /></div>
              </div>
            </div>
          ) : f && (
            <div className="space-y-3 text-sm">
              {sel === "date" && <label className="flex items-center gap-2"><input type="checkbox" checked={t.fields.date?.enabled ?? true} onChange={(e) => setField("date", { enabled: e.target.checked } as Partial<CertField>)} /> Tarihi göster</label>}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">X %</label><input type="number" step={0.5} value={f.x} onChange={(e) => setField(sel, { x: Number(e.target.value) })} className="input" /></div>
                <div><label className="label">Y %</label><input type="number" step={0.5} value={f.y} onChange={(e) => setField(sel, { y: Number(e.target.value) })} className="input" /></div>
                <div><label className="label">Boyut px</label><input type="number" min={8} max={200} value={f.size} onChange={(e) => setField(sel, { size: Number(e.target.value) })} className="input" /></div>
                <div><label className="label">Renk</label><input type="color" value={f.color} onChange={(e) => setField(sel, { color: e.target.value })} className="h-10 w-full" /></div>
                <div><label className="label">Hizalama</label><select value={f.align} onChange={(e) => setField(sel, { align: e.target.value as CertField["align"] })} className="input"><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option></select></div>
                <div><label className="label">Kalınlık</label><select value={f.weight} onChange={(e) => setField(sel, { weight: e.target.value as CertField["weight"] })} className="input"><option value="400">Normal</option><option value="600">Yarı kalın</option><option value="700">Kalın</option></select></div>
                <div className="col-span-2"><label className="label">Font</label>
                  <select value={f.font} onChange={(e) => setField(sel, { font: e.target.value })} className="input">
                    {["Başlık", "Serif", "Sans", "El yazısı"].map((g) => <optgroup key={g} label={g}>{CERT_FONTS.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
                  </select>
                </div>
                <div><label className="label">Harf aralığı</label><input type="number" min={-5} max={30} step={0.5} value={f.spacing} onChange={(e) => setField(sel, { spacing: Number(e.target.value) })} className="input" /></div>
                <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={f.caps} onChange={(e) => setField(sel, { caps: e.target.checked })} /> BÜYÜK HARF</label>
              </div>
            </div>
          )}
        </div>
        <div className="card space-y-3 text-sm">
          <h3 className="font-bold text-navy-800">Verilme kuralı</h3>
          <div><label className="label">Kapsam</label><select value={t.rule.scope} onChange={(e) => setT({ ...t, rule: { ...t.rule, scope: e.target.value as CertRule["scope"] } })} className="input"><option value="all">Tüm eğitimler</option><option value="course">Belirli bir eğitim</option></select></div>
          {t.rule.scope === "course" && <div><label className="label">Eğitim</label><select value={t.rule.courseId} onChange={(e) => setT({ ...t, rule: { ...t.rule, courseId: Number(e.target.value) } })} className="input"><option value={0}>Seçiniz</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>}
          <div><label className="label">Koşul</label><select value={t.rule.condition} onChange={(e) => setT({ ...t, rule: { ...t.rule, condition: e.target.value as CertRule["condition"] } })} className="input">{Object.entries(CERT_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={!!t.rule.auto} onChange={(e) => setT({ ...t, rule: { ...t.rule, auto: e.target.checked } })} />
            <span>Kursu bitirince <b>otomatik tanımla</b><br /><span className="text-xs text-muted">Öğrencinin ilerlemesi %100 olduğu anda sertifika verilir, bildirim ve e-posta gider.</span></span>
          </label>
          {t.rule.auto && t.rule.condition !== "completed" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Otomatik verme yalnızca &quot;Kursu bitirince&quot; koşuluyla çalışır; diğer koşullarda eğitmen elle tanımlar.</p>}
          <p className="text-xs text-muted">Otomatik kapalıysa eğitmen/yönetici koşulu sağlayan öğrenciye panelden elle tanımlar. Elle tanımlama her zaman mümkündür.</p>
        </div>
        {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm">{msg}</p>}
        <div className="flex gap-2">
          <button onClick={() => setPreviewOpen(true)} className="btn-secondary flex-1"><Icon name="play" className="size-4" /> Önizle</button>
          <button disabled={pending} onClick={() => start(async () => { const r = await saveCertificateTemplate(t); if (r.ok) { setMsg("Kaydedildi."); if (!t.id && r.id) router.replace(`/admin/sertifikalar/${r.id}`); router.refresh(); } else setMsg(r.error); })} className="btn-primary flex-1"><Icon name="save" className="size-4" /> {pending ? "…" : "Kaydet"}</button>
        </div>
      </aside>

      {/* Tam boyut önizleme: örnek ad/eğitim + bugünün tarihi + temsili QR */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="max-h-full w-full max-w-5xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-white">
              <p className="text-sm font-semibold">Önizleme — {t.title || "İsimsiz sertifika"}</p>
              <button onClick={() => setPreviewOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Kapat"><Icon name="x" className="size-5" /></button>
            </div>
            <div className="overflow-hidden rounded-xl shadow-2xl">
              <CertificateCanvas imageUrl={t.imageUrl} imageWidth={t.imageWidth} imageHeight={t.imageHeight} fields={t.fields} name={t.sampleName} course={t.sampleCourse} date={today} qrDataUrl={fakeQr} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DuplicateTemplateButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => start(async () => { const r = await duplicateCertificateTemplate(id); if (r.ok && r.id) router.push(`/admin/sertifikalar/${r.id}`); else router.refresh(); })} className="btn-secondary btn-sm">{pending ? "…" : "Çoğalt"}</button>
  );
}

export function DeleteTemplateButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => { if (prompt(`Silmek için tasarım adını yaz: "${title}"\nVerilmiş sertifikalar da silinir!`) === title) start(async () => { await deleteCertificateTemplate(id); router.refresh(); }); }} className="btn-secondary btn-sm text-red-600">Sil</button>
  );
}
