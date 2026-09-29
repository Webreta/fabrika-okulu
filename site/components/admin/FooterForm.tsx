"use client";

import { useFieldId } from "@/components/useFieldId";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRawSetting, uploadSiteImage } from "@/app/actions/admin";
import { Toast } from "@/components/Toast";
import { Icon } from "@/components/site/Icon";
import { DEFAULT_FOOTER, FOOTER_MAX_COLUMNS, type FooterColumn, type FooterContent } from "@/lib/content-defaults";

const MODES: { value: FooterContent["contactMode"]; label: string; desc: string }[] = [
  { value: "auto", label: "İletişim sekmesinden al", desc: "İletişim sekmesindeki ilk telefon, ilk WhatsApp numarası ve e-posta gösterilir; orada değişince footer da değişir." },
  { value: "custom", label: "Footer'a özel gir", desc: "Aşağıya yazdıkların gösterilir. Boş bıraktığın kutu görünmez." },
  { value: "hidden", label: "Gösterme", desc: "Telefon / WhatsApp / e-posta kutuları footer'da yer almaz." },
];

/**
 * Footer düzenleyici (Site İçeriği → Footer): logo, slogan, kısa metin, iletişim kutuları ve bağlantı sütunları.
 * Ayar anahtarı: footer. Telif şeridi (en alttaki satır) sabittir.
 */
export function FooterForm({ footer, auto }: { footer: FooterContent; auto: { phone: string; whatsapp: string; email: string } }) {
  const fid = useFieldId();
  const [f, setF] = useState<FooterContent>(footer);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const setCol = (i: number, patch: Partial<FooterColumn>) => setF({ ...f, columns: f.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const moveCol = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= f.columns.length) return; const columns = [...f.columns]; [columns[i], columns[j]] = [columns[j], columns[i]]; setF({ ...f, columns }); };
  const setLink = (ci: number, li: number, patch: Partial<FooterColumn["links"][number]>) => setCol(ci, { links: f.columns[ci].links.map((l, j) => (j === li ? { ...l, ...patch } : l)) });
  const moveLink = (ci: number, li: number, d: -1 | 1) => { const j = li + d; const links = [...f.columns[ci].links]; if (j < 0 || j >= links.length) return; [links[li], links[j]] = [links[j], links[li]]; setCol(ci, { links }); };

  const save = () =>
    start(async () => {
      const clean: FooterContent = {
        ...f,
        slogan: f.slogan.trim(),
        text: f.text.trim(),
        phone: f.phone.trim(),
        whatsapp: f.whatsapp.trim(),
        email: f.email.trim(),
        columns: f.columns
          .map((c) => ({ title: c.title.trim(), categories: c.categories, links: c.links.map((l) => ({ label: l.label.trim(), href: l.href.trim() })).filter((l) => l.label && l.href) }))
          .filter((c) => c.title && (c.categories || c.links.length > 0))
          .slice(0, FOOTER_MAX_COLUMNS),
      };
      const bad = clean.columns.flatMap((c) => c.links).find((l) => !/^(\/(?![\/\\])|https?:\/\/|mailto:|tel:)/i.test(l.href));
      if (bad) { setMsg(`"${bad.label}" bağlantısının adresi / ile (site içi) ya da https:// ile başlamalı.`); return; }
      // Başlığı boş ama içi dolu sütun sessizce silinmesin
      const untitled = f.columns.findIndex((c) => !c.title.trim() && (c.categories || c.links.some((l) => l.label.trim() || l.href.trim())));
      if (untitled !== -1) { setMsg(`${untitled + 1}. sütunun başlığı boş. Başlık yaz ya da sütunu sil.`); return; }
      const half = f.columns.flatMap((c) => c.links).find((l) => !!l.label.trim() !== !!l.href.trim());
      if (half) { setMsg(`"${half.label.trim() || half.href.trim()}" bağlantısında yazı ya da adres eksik.`); return; }
      setF(clean);
      const r = await saveRawSetting("footer", clean);
      setMsg(r.ok ? "Kaydedildi." : r.error);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {/* Marka */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-bold text-navy-800">1. Logo ve metinler</h2>
          <p className="text-xs text-muted">Footer&apos;ın en üstünde, ortada görünür.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div>
            <label htmlFor={fid("logo")} className="label">Logo</label>
            <div className="flex h-28 items-center justify-center rounded-xl bg-navy-950 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.logo || DEFAULT_FOOTER.logo} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="btn-secondary btn-sm cursor-pointer">
                {busy ? "…" : "Görsel seç"}
                <input id={fid("logo")} type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); const fd = new FormData(); fd.append("file", file); const r = await uploadSiteImage(fd); if (r.ok) setF({ ...f, logo: r.url }); else setMsg(r.error); setBusy(false); }} />
              </label>
              {f.logo !== DEFAULT_FOOTER.logo && <button type="button" onClick={() => setF({ ...f, logo: DEFAULT_FOOTER.logo })} className="btn-secondary btn-sm">Varsayılana dön</button>}
            </div>
            <p className="mt-1 text-[11px] text-muted">Koyu zeminde görüneceği için açık renkli (beyaz) logo kullan.</p>
          </div>
          <div className="space-y-3">
            <div><label htmlFor={fid("a1")} className="label">Slogan (el yazısı satır)</label><input id={fid("a1")} value={f.slogan} onChange={(e) => setF({ ...f, slogan: e.target.value })} className="input" placeholder="Boş bırakılırsa görünmez" /></div>
            <div><label htmlFor={fid("a2")} className="label">Kısa metin</label><textarea id={fid("a2")} rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} className="input" placeholder="Boş bırakılırsa görünmez" /></div>
          </div>
        </div>
      </div>

      {/* İletişim kutuları */}
      <div className="card space-y-3">
        <div>
          <h2 className="font-bold text-navy-800">2. İletişim kutuları</h2>
          <p className="text-xs text-muted">Telefon, WhatsApp ve e-posta. Kutular içeriğe göre genişler; e-posta adresi tam görünür.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.value} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition ${f.contactMode === m.value ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"}`}>
              <input type="radio" name="footer-contact" className="mt-1" checked={f.contactMode === m.value} onChange={() => setF({ ...f, contactMode: m.value })} />
              <span>
                <span className="block font-semibold text-navy-800">{m.label}</span>
                <span className="block text-xs text-muted">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>
        {f.contactMode === "auto" && (
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-navy-700">Şu an gösterilen: <b>{auto.phone || "telefon yok"}</b> · <b>{auto.whatsapp || "WhatsApp yok"}</b> · <b>{auto.email || "e-posta yok"}</b>. Değiştirmek için <a href="/admin/icerik?sekme=iletisim" className="text-sky-600 underline">İletişim sekmesi</a>.</p>
        )}
        {f.contactMode === "custom" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label htmlFor={fid("a3")} className="label">Telefon</label><input id={fid("a3")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="input" placeholder="0 850 000 00 00" /></div>
            <div><label htmlFor={fid("a4")} className="label">WhatsApp</label><input id={fid("a4")} value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} className="input" placeholder="0 532 000 00 00" /></div>
            <div><label htmlFor={fid("a5")} className="label">E-posta</label><input id={fid("a5")} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="input" placeholder="info@ornek.com" /></div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.showSocials} onChange={(e) => setF({ ...f, showSocials: e.target.checked })} /> Sosyal medya ikonlarını göster <span className="text-xs text-muted">(adresler İletişim sekmesinden gelir)</span></label>
      </div>

      {/* Bağlantı sütunları */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy-800">3. Bağlantı sütunları</h2>
            <p className="text-xs text-muted">En fazla {FOOTER_MAX_COLUMNS} sütun. Site içi adresler / ile başlar (örn. /kesfet); dış adresler https:// ile başlar ve yeni sekmede açılır.</p>
          </div>
          <button type="button" disabled={f.columns.length >= FOOTER_MAX_COLUMNS} onClick={() => setF({ ...f, columns: [...f.columns, { title: "", categories: false, links: [{ label: "", href: "" }] }] })} className="btn-secondary btn-sm"><Icon name="plus" className="size-4" /> Sütun ekle</button>
        </div>
        {f.columns.length === 0 && <p className="text-sm text-muted">Sütun yok; footer&apos;da bağlantı alanı görünmez.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {f.columns.map((c, ci) => (
            <div key={ci} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input aria-label="Sütun başlığı" value={c.title} onChange={(e) => setCol(ci, { title: e.target.value })} className="input font-semibold" placeholder="Sütun başlığı" />
                <button type="button" onClick={() => moveCol(ci, -1)} disabled={ci === 0} className="btn-secondary btn-sm px-2" title="Sola al"><Icon name="arrowLeft" className="size-4" /></button>
                <button type="button" onClick={() => moveCol(ci, 1)} disabled={ci === f.columns.length - 1} className="btn-secondary btn-sm px-2" title="Sağa al"><Icon name="arrowRight" className="size-4" /></button>
                <button type="button" onClick={() => { if (confirm(`"${c.title || "Sütun"}" silinsin mi?`)) setF({ ...f, columns: f.columns.filter((_, j) => j !== ci) }); }} className="btn-secondary btn-sm px-2 text-red-600" title="Sütunu sil"><Icon name="trash" className="size-4" /></button>
              </div>
              <label className="mt-2 flex items-start gap-2 text-xs text-navy-800"><input type="checkbox" className="mt-0.5" checked={c.categories} onChange={(e) => setCol(ci, { categories: e.target.checked })} /> <span>Eğitim kategorilerini otomatik listele <span className="text-muted">(Kategoriler sayfasındaki sırayla, bağlantıların üstünde)</span></span></label>
              <div className="mt-3 space-y-2">
                {c.links.map((l, li) => (
                  <div key={li} className="flex items-center gap-1.5">
                    <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[2fr_3fr]">
                      <input aria-label="Bağlantı yazısı" value={l.label} onChange={(e) => setLink(ci, li, { label: e.target.value })} className="input" placeholder="Yazı" />
                      <input aria-label="Bağlantı adresi" value={l.href} onChange={(e) => setLink(ci, li, { href: e.target.value })} className="input font-mono text-xs" placeholder="/adres" />
                    </div>
                    <button type="button" onClick={() => moveLink(ci, li, -1)} disabled={li === 0} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" title="Yukarı"><Icon name="chevronUp" className="size-4" /></button>
                    <button type="button" onClick={() => moveLink(ci, li, 1)} disabled={li === c.links.length - 1} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30" title="Aşağı"><Icon name="chevronDown" className="size-4" /></button>
                    <button type="button" onClick={() => setCol(ci, { links: c.links.filter((_, j) => j !== li) })} className="rounded p-1 text-red-600 hover:bg-red-50" title="Sil"><Icon name="x" className="size-4" /></button>
                  </div>
                ))}
                {c.links.length === 0 && !c.categories && <p className="text-xs text-muted">Bağlantı yok; bu sütun kaydedilmez.</p>}
              </div>
              <button type="button" onClick={() => setCol(ci, { links: [...c.links, { label: "", href: "" }] })} className="btn-secondary btn-sm mt-3"><Icon name="plus" className="size-3.5" /> Bağlantı ekle</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => { if (confirm("Footer varsayılan içeriğe dönsün mü? Kaydet'e basana kadar sitede değişmez.")) setF({ ...DEFAULT_FOOTER, text: f.text }); }} className="btn-secondary btn-sm">Varsayılan içeriği yükle</button>
        <div className="flex items-center gap-3">
          {msg && <Toast message={msg} ok={msg === "Kaydedildi."} onDone={() => setMsg("")} />}
          <a href="/#footer" target="_blank" rel="noopener" className="text-sm font-semibold text-sky-600 hover:underline">Sitede gör</a>
          <button disabled={pending} onClick={save} className="btn-primary">{pending ? "…" : "Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}
