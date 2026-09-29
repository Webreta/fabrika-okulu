"use client";

import { useFieldId } from "@/components/useFieldId";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseInput } from "@/lib/course-save";
import { generateSlots } from "@/lib/meeting";
import { saveCourseAction, uploadCourseImage, uploadProtectedFile, notifyPeriodStudents } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";
import { todayISO } from "@/lib/format";
import { COURSE_LIMITS as L } from "@/lib/course-limits";

type Module = CourseInput["modules"][number];
type Lesson = Module["lessons"][number];
type Question = Lesson["questions"][number];
type Period = CourseInput["periods"][number];

const newLesson = (type: Lesson["type"]): Lesson => ({
  type, title: "", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "", fileUrl: "", fileName: "", fileMime: "",
  questions: type === "quiz" ? [newQuestion(), newQuestion()] : [], timeLimit: 0, passScore: 0, maxAttempts: 1,
  shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true,
});
const newQuestion = (): Question => ({ qtype: "multiple_choice", text: "", points: 1, options: ["", "", "", ""], correct: 0, explanation: "", image: "" });
const newPeriod = (): Period => ({ name: "", startDate: "", startTime: "", endDate: "", capacity: 20, description: "", schedule: [] });

// Görev yalnızca dönemli eğitimde olabilir: "Standart" (dönemsiz) şablonda görev yoktur;
// "Dönemli" ve "Atölye" şablonları doldurulacak bir başlangıç dönemiyle birlikte gelir.
const TEMPLATES: Record<string, Module[]> = {
  standart: [
    { title: "Modül 1: Giriş", lessons: [newLesson("video"), newLesson("video")] },
    { title: "Modül 2: Derinleşme", lessons: [newLesson("video"), newLesson("video"), newLesson("quiz")] },
  ],
  donemli: [
    { title: "Modül 1: Temeller", lessons: [newLesson("video"), newLesson("video"), newLesson("quiz")] },
    { title: "Modül 2: Canlı Oturumlar", lessons: [newLesson("video"), newLesson("assign")] },
  ],
  atolye: [
    { title: "Atölye 1", lessons: [newLesson("video"), newLesson("assign"), newLesson("assign")] },
    { title: "Atölye 2", lessons: [newLesson("video"), newLesson("assign")] },
  ],
};

const LESSON_META = {
  video: { label: "Video", cls: "border-sky-300 bg-sky-50", chip: "bg-sky-100 text-sky-700" },
  quiz: { label: "Sınav", cls: "border-amber-300 bg-amber-50", chip: "bg-amber-100 text-amber-700" },
  assign: { label: "Görev", cls: "border-emerald-300 bg-emerald-50", chip: "bg-emerald-100 text-emerald-700" },
  file: { label: "Dosya", cls: "border-violet-300 bg-violet-50", chip: "bg-violet-100 text-violet-700" },
} as const;

function Section({ title, hint, id, children }: { title: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-44">
      <h2 className="font-bold text-navy-800">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function CourseEditor({
  initial, locked, isAdmin, instructors, periodEnrolled = {}, backHref, allCourses = [], categories = [],
}: {
  initial: CourseInput; locked: boolean; isAdmin: boolean; categories?: { id: number; name: string }[];
  instructors: { id: number; name: string }[]; periodEnrolled?: Record<number, number>; backHref: string;
  allCourses?: { id: number; title: string }[];
}) {
  const fid = useFieldId();
  const [c, setC] = useState<CourseInput>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [publishStep, setPublishStep] = useState(0);
  const [busy, setBusy] = useState("");
  const router = useRouter();
  const isNew = !c.id;
  const isAdminShell = backHref.startsWith("/admin");
  const today = todayISO();
  // Dönemli (takvimli) kursta teslim mutlak tarihle, esnek kursta gün sayısıyla girilir
  const hasPeriods = c.periods.length > 0;

  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const set = <K extends keyof CourseInput>(k: K, v: CourseInput[K]) => setC((x) => ({ ...x, [k]: v }));
  const setModule = (i: number, m: Module) => set("modules", c.modules.map((x, j) => (j === i ? m : x)));
  const setLesson = (mi: number, li: number, l: Lesson) => setModule(mi, { ...c.modules[mi], lessons: c.modules[mi].lessons.map((x, j) => (j === li ? l : x)) });
  const move = <T,>(arr: T[], i: number, d: -1 | 1) => { const n = [...arr]; const j = i + d; if (j < 0 || j >= n.length) return arr; [n[i], n[j]] = [n[j], n[i]]; return n; };

  // Kayıttan sonra sunucudaki hâli yüklenir: yeni eklenen modül/ders/dönemler kimlik alır (ikinci kayıtta yeniden oluşturulmaz),
  // durum (taslak/yayında) güncellenir. Yalnızca kendi kaydımızın ardından uygulanır; başka yenilemeler yazılanı silmez.
  const reloadAfterSave = useRef(false);
  useEffect(() => {
    if (!reloadAfterSave.current) return;
    reloadAfterSave.current = false;
    setC(initial);
  }, [initial]);

  // Yeni eğitim ilk kaydında editör eğitimin kendi adresine geçer ve yeniden kurulur; kayıt iletisi bu geçişte kaybolmasın
  useEffect(() => {
    try {
      const m = sessionStorage.getItem("fabo_editor_msg");
      if (!m) return;
      sessionStorage.removeItem("fabo_editor_msg");
      setMsg({ ok: true, text: m });
    } catch {}
  }, []);

  const save = (status: "draft" | "published") => {
    // Kilitli ve yayındaki eğitim yayında kalır (sunucu da böyle uygular)
    const next = locked && c.status === "published" ? "published" : status;
    if (c.status === "published" && next === "draft" && !confirm("Bu eğitim şu an YAYINDA.\n\nTaslak olarak kaydedersen yayından kalkar: sitede görünmez ve satın alınamaz.\n\nYayından kaldırılsın mı? (Yayında kalsın istiyorsan Vazgeç'e basıp “Kaydet” düğmesini kullan.)")) return;
    start(async () => {
      setMsg(null);
      const r = await saveCourseAction({ ...c, status: next, relations: c.relations?.filter((x) => x.relatedCourseId > 0) });
      setPublishStep(0);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: r.message ?? "Kaydedildi." });
      setC((x) => ({ ...x, status: next }));
      if (isNew && r.id) {
        try { sessionStorage.setItem("fabo_editor_msg", r.message ?? "Kaydedildi."); } catch {}
        router.replace(`${backHref}/editor/${r.id}`);
      }
      else { reloadAfterSave.current = true; router.refresh(); }
    });
  };

  const addPeriod = (p: Period = newPeriod()) => setC((x) => ({ ...x, periods: [...x.periods, p] }));
  const goToPeriods = () => document.getElementById("donemler")?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Görev içeren şablon dönemsiz kaydedilemez: doldurulacak bir başlangıç dönemiyle birlikte eklenir
  const applyTemplate = (k: string) => {
    const mods = structuredClone(TEMPLATES[k]);
    const needsPeriod = mods.some((m) => m.lessons.some((l) => l.type === "assign"));
    setC((x) => ({ ...x, modules: mods, periods: needsPeriod && x.periods.length === 0 ? [{ ...newPeriod(), name: "1. Dönem" }] : x.periods }));
    if (needsPeriod) setMsg({ ok: true, text: "Şablon eklendi. Görevli eğitim dönem ister: aşağıdaki “Dönemler” bölümünde 1. Dönem'in tarihlerini gir." });
  };
  const assignCount = c.type === "meeting" ? 0 : c.modules.flatMap((m) => m.lessons).filter((l) => l.type === "assign").length;

  const uploadCover = async (f: File | undefined) => {
    if (!f) return;
    setBusy("cover");
    const fd = new FormData(); fd.append("file", f);
    const r = await uploadCourseImage(fd);
    if (r.ok) set("imageUrl", r.url); else setMsg({ ok: false, text: r.error });
    setBusy("");
  };

  const uploadLessonFile = async (mi: number, li: number, f: File | undefined) => {
    if (!f) return;
    setBusy(`file-${mi}-${li}`);
    const fd = new FormData(); fd.append("file", f);
    const r = await uploadProtectedFile(fd);
    if (r.ok) setLesson(mi, li, { ...c.modules[mi].lessons[li], fileUrl: r.fileUrl, fileName: r.fileName, fileMime: r.fileMime, title: c.modules[mi].lessons[li].title || r.fileName });
    else setMsg({ ok: false, text: r.error });
    setBusy("");
  };

  const counts = {
    modules: c.modules.length,
    videos: c.modules.flatMap((m) => m.lessons).filter((l) => l.type === "video").length,
    quizzes: c.modules.flatMap((m) => m.lessons).filter((l) => l.type === "quiz").length,
    assigns: c.modules.flatMap((m) => m.lessons).filter((l) => l.type === "assign").length,
    files: c.modules.flatMap((m) => m.lessons).filter((l) => l.type === "file").length,
  };

  return (
    <div className="space-y-5">
      {/* Üst bar */}
      {/* Telefonda tek satır: başlık kısalır, durum metni gizlenir, düğmeler simgeye iner (çubuk ekranı kaplamasın) */}
      <div className={`sticky z-30 flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2 shadow-sm sm:flex-wrap sm:gap-3 sm:px-4 sm:py-3 lg:px-8 ${isAdminShell ? "top-0 -mx-4 -mt-4 lg:-mx-8 lg:-mt-8" : "top-[110px] -mx-4 -mt-6 lg:-mx-6 lg:-mt-7"}`}>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-navy-800 sm:text-lg">{isNew ? "Yeni Eğitim" : c.title || "Eğitim"}</h1>
          <p className="hidden text-xs text-muted sm:block">{locked ? (c.status === "published" ? "Yayında — müfredat ve dönemler kilitli, yalnızca oturum linkleri güncellenebilir." : "Taslak — kayıtlı öğrencisi olduğu için müfredat ve dönemler kilitli; değişiklik için yöneticiye yaz.") : c.status === "published" ? "Yayında (yönetici düzenlemesi)" : "Taslak"}</p>
        </div>
        {msg && (
          <div className={`absolute right-4 top-full mt-2 z-50 flex max-w-[min(90vw,520px)] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg lg:right-8 ${msg.ok ? "bg-emerald-600 text-[#fff]" : "bg-red-600 text-[#fff]"}`} role="status">
            <Icon name={msg.ok ? "check" : "alert"} className="size-4 shrink-0" /> <span>{msg.text}</span>
            {!msg.ok && <button onClick={() => setMsg(null)} className="ml-2 opacity-80 hover:opacity-100" aria-label="Kapat"><Icon name="x" className="size-4" /></button>}
          </div>
        )}
        <div className="flex shrink-0 gap-1.5 sm:flex-wrap sm:gap-2">
          {!isNew && <Link href={`/kurs-izle/${c.id}`} target="_blank" aria-label="Player önizle" className="btn-secondary btn-sm"><Icon name="play" className="size-4" /> <span className="hidden sm:inline">Player önizle</span></Link>}
          {locked && c.status === "published" ? (
            <button onClick={() => save("published")} disabled={pending} className="btn-primary btn-sm">{pending ? "Kaydediliyor…" : <><span className="sm:hidden">Kaydet</span><span className="hidden sm:inline">Değişiklikleri kaydet</span></>}</button>
          ) : (
            <>
              {/* Yayındaki eğitimde bu düğme eğitimi yayından kaldırır; onay sorulur */}
              <button onClick={() => save("draft")} disabled={pending} aria-label={c.status === "published" ? "Taslağa al" : "Taslak kaydet"} className="btn-secondary btn-sm" title={c.status === "published" ? "Eğitimi yayından kaldırıp taslak olarak kaydeder" : undefined}><Icon name="save" className="size-4" /> <span className="hidden sm:inline">{c.status === "published" ? "Taslağa al" : "Taslak kaydet"}</span></button>
              <button onClick={() => (c.status === "published" ? save("published") : setPublishStep(1))} disabled={pending} className="btn-primary btn-sm"><Icon name="check" className="size-4" /> {c.status === "published" ? "Kaydet" : "Yayınla"}</button>
            </>
          )}
        </div>
      </div>


      {isNew && c.modules.length === 0 && (
        <Section title="Şablondan başla" hint="Bir şablon seç, sonra istediğin gibi düzenle.">
          <div className="grid gap-3 sm:grid-cols-3">
            {[["standart", "Standart", "2 modül · video + sınav (dönemsiz)"], ["donemli", "Dönemli", "Temeller + canlı oturumlar · görevli, dönem ister"], ["atolye", "Atölye", "Uygulama ağırlıklı görevler · dönem ister"]].map(([k, l, d]) => (
              <button key={k} onClick={() => applyTemplate(k)} className="rounded-xl border border-line p-4 text-left hover:border-sky-400 hover:bg-sky-50">
                <p className="font-semibold text-navy-800">{l}</p><p className="text-xs text-muted">{d}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Eğitim Türü" hint="Online görüşme ürününde müfredat yoktur; öğrenci bir görüşme saati (koltuk) seçer, Zoom bağlantısıyla katılır.">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { v: "course", label: "Video / içerik eğitimi", desc: "Modüller, dersler, sınav ve görevler." },
            { v: "meeting", label: "Online görüşme (Zoom)", desc: "Yalnızca birebir görüşme; koltuklar tarih-saat olarak açılır." },
          ] as const).map((o) => (
            <label key={o.v} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition ${c.type === o.v ? "border-sky-400 bg-sky-50" : "border-line hover:bg-surface"} ${locked ? "pointer-events-none opacity-60" : ""}`}>
              <input type="radio" name="course-type" className="mt-1" checked={c.type === o.v} disabled={locked} onChange={() => set("type", o.v)} />
              <span><span className="block font-semibold text-navy-800">{o.label}</span><span className="block text-xs text-muted">{o.desc}</span></span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Genel Bilgiler">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label htmlFor={fid("a1")} className="label">Eğitim başlığı *</label><input id={fid("a1")} value={c.title} maxLength={L.title} onChange={(e) => set("title", e.target.value)} className="input" /></div>
          <div className="md:col-span-2"><label htmlFor={fid("a2")} className="label">Kısa açıklama</label><textarea id={fid("a2")} rows={2} value={c.shortDescription} maxLength={L.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="input" /><p className="text-[11px] text-muted">{c.shortDescription.length}/{L.shortDescription}</p></div>
          <div className="md:col-span-2">
            <label htmlFor={fid("a3")} className="label">Açıklama <span className="text-muted">(HTML kullanılabilir: &lt;p&gt;, &lt;h3&gt;, &lt;ul&gt;)</span></label>
            <textarea id={fid("a3")} rows={6} value={c.description} maxLength={L.description} onChange={(e) => set("description", e.target.value)} className="input font-mono text-xs" />
          </div>
          <div>
            <label htmlFor={fid("kapak")} className="label">Kapak görseli <span className="text-muted">(önerilen oran 16:9 — ör. 1280×720 px, YouTube kapak ölçüsü)</span></label>
            <div className="flex items-center gap-3">
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="aspect-video w-40 rounded-lg object-cover" /> : <div className="flex aspect-video w-40 items-center justify-center rounded-lg bg-surface text-muted"><Icon name="upload" className="size-5" /></div>}
              <label className="btn-secondary btn-sm cursor-pointer">{busy === "cover" ? "Yükleniyor…" : "Görsel seç"}<input id={fid("kapak")} type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} /></label>
              {c.imageUrl && <button onClick={() => set("imageUrl", "")} className="text-xs text-red-600">Kaldır</button>}
            </div>
          </div>
          <div><label htmlFor={fid("a4")} className="label">Önizleme videosu (URL)</label><input id={fid("a4")} value={c.previewVideo} maxLength={L.url} onChange={(e) => set("previewVideo", e.target.value)} className="input" placeholder="YouTube / Vimeo" /></div>
          <div><label htmlFor={fid("a5")} className="label">Seviye</label>
            <select id={fid("a5")} value={c.level} onChange={(e) => set("level", e.target.value)} className="input">
              <option value="all">Tüm Seviyeler</option><option value="beginner">Başlangıç</option><option value="intermediate">Orta</option><option value="advanced">İleri</option>
            </select>
          </div>
          <div><label htmlFor={fid("a6")} className="label">Dil</label><input id={fid("a6")} value={c.language} maxLength={40} onChange={(e) => set("language", e.target.value)} className="input" /></div>
          <div className="flex flex-wrap gap-5 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.hasCertificate} onChange={(e) => set("hasCertificate", e.target.checked)} /> Sertifika verilir</label>
            {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.featured} onChange={(e) => set("featured", e.target.checked)} /> Öne çıkan</label>}
            {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.closed} onChange={(e) => set("closed", e.target.checked)} /> Kapalı (satış yok)</label>}
            {isAdmin && <label className="flex items-center gap-2 text-sm" title="Sitede Yakında! rozetiyle görünür, satın alınamaz; ziyaretçiler açılınca haber ver diyerek talep bırakır. Kutuyu kaldırıp kaydedince talep bırakanlara haber gider."><input type="checkbox" checked={!!c.comingSoon} onChange={(e) => setC((x) => ({ ...x, comingSoon: e.target.checked, ...(e.target.checked ? { preorder: false } : {}) }))} /> Yakında (ön gösterim, talep topla)</label>}
            {isAdmin && c.comingSoon && <label className="flex items-center gap-2 text-sm" title="Kapalıysa kartta ve program sayfasında fiyat yerine Yakında yazar"><input type="checkbox" checked={!!c.soonShowPrice} onChange={(e) => set("soonShowPrice", e.target.checked)} /> Yakında iken fiyatı göster</label>}
          </div>
          {isAdmin && (
            <>
              <div><label htmlFor={fid("a7")} className="label">Eğitmen</label>
                <select id={fid("a7")} value={c.instructorId ?? ""} onChange={(e) => set("instructorId", e.target.value ? Number(e.target.value) : null)} className="input">
                  <option value="">— Seçiniz —</option>{instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div><label htmlFor={fid("a8")} className="label">Buton tipi</label>
                <select id={fid("a8")} value={c.buttonType} onChange={(e) => set("buttonType", e.target.value)} className="input"><option value="cart">Sepete ekle</option><option value="whatsapp">WhatsApp</option><option value="both">İkisi</option></select>
              </div>
              {c.buttonType !== "cart" && (
                <>
                  <div><label htmlFor={fid("a9")} className="label">WhatsApp numarası (kurs özel)</label><input id={fid("a9")} value={c.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value.replace(/[^\d\s+()-]/g, ""))} inputMode="tel" maxLength={30} className="input" placeholder="905xxxxxxxxx" /></div>
                  <div><label htmlFor={fid("a10")} className="label">WhatsApp mesajı</label><input id={fid("a10")} value={c.whatsappMessage ?? ""} onChange={(e) => set("whatsappMessage", e.target.value)} className="input" placeholder="{course_name} {course_price}" /></div>
                </>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Kazanımlar & İçerik">
        <div className="grid gap-4 md:grid-cols-2">
          <div><label htmlFor={fid("a11")} className="label">Kazanımlar (her satıra bir tane, en fazla {L.outcomeCount})</label><textarea id={fid("a11")} rows={6} value={c.outcomes.join("\n")} onChange={(e) => set("outcomes", e.target.value.split("\n"))} className="input" /></div>
          <div><label htmlFor={fid("a12")} className="label">Hedef kitle (&quot;Kimin için?&quot;, her satıra bir tane)</label><textarea id={fid("a12")} rows={6} value={c.target} maxLength={L.target} onChange={(e) => set("target", e.target.value)} className="input" /></div>
        </div>
      </Section>

      <Section title="Fiyatlandırma">
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={c.isFree} onChange={(e) => set("isFree", e.target.checked)} /> Ücretsiz eğitim</label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor={fid("a13")} className="label">Fiyat ₺</label><input id={fid("a13")} type="number" min={0} max={L.maxPrice} step="0.01" disabled={c.isFree} value={c.price} onChange={(e) => set("price", Number(e.target.value))} className="input" /></div>
          <div><label htmlFor={fid("a14")} className="label">İndirimli fiyat ₺</label><input id={fid("a14")} type="number" min={0} max={L.maxPrice} step="0.01" disabled={c.isFree} value={c.salePrice} onChange={(e) => set("salePrice", Number(e.target.value))} className="input" /><p className="text-[11px] text-muted">Fiyattan düşük olmalı · 0 = indirim yok</p></div>
          <div><label htmlFor={fid("a15")} className="label">İndirim bitiş tarihi</label><input id={fid("a15")} type="date" disabled={c.isFree} value={c.saleTo} onChange={(e) => set("saleTo", e.target.value)} className="input" /></div>
        </div>
        {/* Erken kayıt (yalnızca yönetici): açılış tarihine kadar satılır, içerik açılışta aktifleşir */}
        {isAdmin && c.type !== "meeting" && (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-navy-800"><input type="checkbox" checked={!!c.preorder} onChange={(e) => setC((x) => ({ ...x, preorder: e.target.checked, ...(e.target.checked ? { comingSoon: false } : {}) }))} /> Erken kayıt (açılış tarihli ön satış)</label>
            <p className="mt-1 text-xs text-muted">Eğitim henüz açık değil ama açılış tarihi belli. Öğrenci şimdiden sipariş verir; eğitim Kitaplığında &quot;şu tarihte aktifleşecek&quot; notuyla görünür ve açılış günü kendiliğinden açılır. Tarih gelince erken kayıt fiyatı biter, normal fiyata dönülür. &quot;Yakında&quot; ile birlikte kullanılamaz.</p>
            {c.preorder && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div><label htmlFor={fid("a16")} className="label">Açılış tarihi</label><input id={fid("a16")} type="date" value={c.opensAt ?? ""} onChange={(e) => set("opensAt", e.target.value)} className="input" /></div>
                <div><label htmlFor={fid("a17")} className="label">Erken kayıt fiyatı ₺</label><input id={fid("a17")} type="number" min={0} step="0.01" disabled={c.isFree} value={c.preorderPrice ?? 0} onChange={(e) => set("preorderPrice", Number(e.target.value))} className="input" /></div>
                <p className="self-end text-xs text-muted">Fiyat 0 bırakılırsa erken kayıtta da normal fiyat (ya da geçerli indirim) uygulanır.</p>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Online görüşme ayarları + koltuk üretici */}
      {c.type === "meeting" && (
        <Section title="Görüşme Ayarları" hint="Süre ve Zoom bağlantısı; koltukları aşağıdaki üreticiyle toplu aç, sonra listeden tek tek düzenleyebilirsin.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label htmlFor={fid("a18")} className="label">Görüşme süresi (dk)</label><input id={fid("a18")} type="number" min={5} step={5} value={c.meetingMinutes} onChange={(e) => set("meetingMinutes", Number(e.target.value))} className="input" /></div>
            <div className="sm:col-span-2"><label htmlFor={fid("a19")} className="label">Zoom / Meet bağlantısı</label><input id={fid("a19")} value={c.meetingLink} maxLength={L.url} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://zoom.us/j/…" className="input" /><p className="text-[11px] text-muted">Tüm koltuklar için varsayılan; koltuk oturumunda ayrıca değiştirilebilir.</p></div>
          </div>
          {!locked && <SlotGenerator minutes={c.meetingMinutes} link={c.meetingLink} onGenerate={(slots) => set("periods", [...c.periods, ...slots])} />}
        </Section>
      )}

      {/* Müfredat */}
      {!locked && assignCount > 0 && !hasPeriods && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Bu eğitimde {assignCount} görev var ama dönem yok.</p>
          <p className="mt-1">Görev yalnızca dönemli (takvimli) eğitimde olabilir; bu hâliyle kaydedilemez. Bir dönem ekleyip tarihlerini gir ya da görevleri müfredattan sil.</p>
          <button onClick={() => { addPeriod({ ...newPeriod(), name: "1. Dönem" }); setTimeout(goToPeriods, 50); }} className="btn-primary btn-sm mt-3"><Icon name="plus" className="size-4" /> Dönem ekle</button>
        </div>
      )}
      {c.type !== "meeting" && <Section title="Müfredat" hint={locked ? "Müfredat kilitli." : `${counts.modules} modül · ${counts.videos} video · ${counts.quizzes} sınav · ${counts.assigns} görev · ${counts.files} dosya`}>
        <div className={`space-y-4 ${locked ? "pointer-events-none opacity-70" : ""}`}>
          {c.modules.map((m, mi) => (
            <div key={mi} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted">Modül {mi + 1}</span>
                <input aria-label="Modül başlığı" value={m.title} maxLength={L.moduleTitle} onChange={(e) => setModule(mi, { ...m, title: e.target.value })} placeholder="Modül başlığı" className="input flex-1" />
                <button onClick={() => set("modules", move(c.modules, mi, -1))} className="rounded p-1.5 hover:bg-white" title="Yukarı"><Icon name="chevronUp" className="size-4" /></button>
                <button onClick={() => set("modules", move(c.modules, mi, 1))} className="rounded p-1.5 hover:bg-white" title="Aşağı"><Icon name="chevronDown" className="size-4" /></button>
                <button onClick={() => set("modules", c.modules.filter((_, j) => j !== mi))} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Sil"><Icon name="trash" className="size-4" /></button>
              </div>
              <div className="mt-3 space-y-3">
                {m.lessons.map((l, li) => {
                  const meta = LESSON_META[l.type];
                  return (
                    <div key={li} className={`rounded-lg border bg-white p-3 ${meta.cls}`}>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${meta.chip}`}>{meta.label}</span>
                        <input aria-label={`${meta.label} başlığı`} value={l.title} maxLength={L.lessonTitle} onChange={(e) => setLesson(mi, li, { ...l, title: e.target.value })} placeholder={`${meta.label} başlığı`} className="input flex-1" />
                        <button aria-label="Dersi yukarı taşı" onClick={() => setModule(mi, { ...m, lessons: move(m.lessons, li, -1) })} className="rounded p-1 hover:bg-surface"><Icon name="chevronUp" className="size-4" /></button>
                        <button aria-label="Dersi aşağı taşı" onClick={() => setModule(mi, { ...m, lessons: move(m.lessons, li, 1) })} className="rounded p-1 hover:bg-surface"><Icon name="chevronDown" className="size-4" /></button>
                        <button aria-label="Dersi sil" onClick={() => setModule(mi, { ...m, lessons: m.lessons.filter((_, j) => j !== li) })} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
                      </div>
                      {l.type === "video" && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px]">
                          <input aria-label="Video URL" value={l.videoUrl} maxLength={L.url} onChange={(e) => setLesson(mi, li, { ...l, videoUrl: e.target.value })} placeholder="Video URL (YouTube / Vimeo / mp4)" className="input" />
                          <input aria-label="Süre (dk:sn)" value={l.duration} onChange={(e) => setLesson(mi, li, { ...l, duration: e.target.value.replace(/[^\d:]/g, "") })} placeholder="dk:sn" inputMode="numeric" maxLength={8} className="input" />
                          <textarea aria-label="Ders açıklaması" rows={2} value={l.description} onChange={(e) => setLesson(mi, li, { ...l, description: e.target.value })} placeholder="Ders açıklaması (isteğe bağlı)" className="input sm:col-span-2" />
                        </div>
                      )}
                      {l.type === "assign" && (
                        <div className={`mt-2 grid gap-2 ${hasPeriods ? "sm:grid-cols-[1fr_260px]" : "sm:grid-cols-[1fr_160px]"}`}>
                          <textarea aria-label="Görev açıklaması" rows={2} value={l.description} onChange={(e) => setLesson(mi, li, { ...l, description: e.target.value })} placeholder="Görev açıklaması" className="input" />
                          {hasPeriods ? (
                            <div>
                              <div className="flex gap-1">
                                <input aria-label="Son tarih" type="date" value={l.dueDate} onChange={(e) => setLesson(mi, li, { ...l, dueDate: e.target.value, dueDays: 0 })} className="input" />
                                <input aria-label="Son saat" type="time" value={l.dueTime} onChange={(e) => setLesson(mi, li, { ...l, dueTime: e.target.value })} className="input w-28" />
                              </div>
                              <p className="mt-1 text-[11px] text-muted">Son teslim tarihi · boş = süresiz · saat boş = 23:59</p>
                            </div>
                          ) : (
                            <div><input aria-label="Süre (gün)" type="number" min={0} value={l.dueDays} onChange={(e) => setLesson(mi, li, { ...l, dueDays: Number(e.target.value) })} className="input" /><p className="mt-1 text-[11px] text-muted">Teslim süresi (gün) · 0 = süresiz</p></div>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-xs sm:col-span-2">
                            <span className="text-muted">Teslim türleri:</span>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={l.allowFile} onChange={(e) => setLesson(mi, li, { ...l, allowFile: e.target.checked })} /> Dosya</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={l.allowVoice} onChange={(e) => setLesson(mi, li, { ...l, allowVoice: e.target.checked })} /> Ses</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={l.allowText} onChange={(e) => setLesson(mi, li, { ...l, allowText: e.target.checked })} /> Metin</label>
                          </div>
                        </div>
                      )}
                      {l.type === "file" && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                          <label className="btn-secondary btn-sm cursor-pointer">{busy === `file-${mi}-${li}` ? "Yükleniyor…" : "Dosya seç (PDF/resim)"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={(e) => uploadLessonFile(mi, li, e.target.files?.[0])} /></label>
                          <span className="text-muted">{l.fileName || "Dosya yok"}</span>
                          <span className="text-[11px] text-muted">öğrenci indiremez · ilerlemeye dahil değil</span>
                        </div>
                      )}
                      {l.type === "quiz" && <QuizBuilder lesson={l} hasPeriods={hasPeriods} onChange={(nl) => setLesson(mi, li, nl)} />}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2">
                  {(["video", "quiz", "assign", "file"] as const).filter((t) => t !== "assign" || hasPeriods).map((t) => (
                    <button key={t} onClick={() => setModule(mi, { ...m, lessons: [...m.lessons, newLesson(t)] })} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> {LESSON_META[t].label}</button>
                  ))}
                  {!hasPeriods && <span className="text-[11px] text-muted">Görev yalnızca takvimli (dönemli) eğitimlerde eklenebilir.</span>}
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => set("modules", [...c.modules, { title: `Modül ${c.modules.length + 1}`, lessons: [] }])} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> Modül ekle</button>
        </div>
      </Section>}

      {/* Dönemler / koltuklar */}
      <Section id="donemler" title={c.type === "meeting" ? `Görüşme Koltukları (${c.periods.length})` : "Dönemler"} hint={locked ? "Kilitli: yalnızca bitmemiş dönemlerin oturum bağlantıları düzenlenebilir." : c.type === "meeting" ? "Her koltuk bir görüşme saatidir; kontenjan genelde 1'dir. Haftalık danışmanlıkta koltuğun birden fazla oturum tarihi olur." : "Dönem eklersen eğitim 'Takvimli Program' olur. Görev/sınav son teslim tarihleri müfredatta ders üzerinde tarih olarak girilir."}>
        <div className="space-y-4">
          {c.periods.map((p, pi) => {
            // Yalnızca kayıtlı dönem "bitti" sayılır; yeni eklenen döneme yanlışlıkla geçmiş tarih yazılırsa alanlar açık kalır
            const passed = !!p.id && !!p.endDate && p.endDate < today;
            const enrolled = p.id ? periodEnrolled[p.id] ?? 0 : 0;
            const frozen = locked || passed;
            return (
              <div key={pi} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-muted">Dönem {pi + 1}{enrolled > 0 && ` · ${enrolled} kayıtlı`}{passed && " · Bitti"}</span>
                  <div className="flex items-center gap-2">
                    {p.id && enrolled > 0 && !passed && <NotifyPeriodButton periodId={p.id} />}
                    {!locked && (enrolled === 0 || isAdmin) && (
                      <button onClick={() => { if (enrolled > 0 && !confirm(`Bu dönemde ${enrolled} kayıtlı öğrenci var. Dönem silinsin mi? (Öğrencilerin kurs erişimi kalır, dönem kaydı düşer.)`)) return; set("periods", c.periods.filter((_, j) => j !== pi)); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Dönemi sil"><Icon name="trash" className="size-4" /></button>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="lg:col-span-2"><label htmlFor={fid(`a20-${pi}`)} className="label">Ad</label><input id={fid(`a20-${pi}`)} disabled={frozen} value={p.name} maxLength={L.periodName} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, name: e.target.value } : x)))} className="input" /></div>
                  <div><label htmlFor={fid(`a21-${pi}`)} className="label">Başlangıç</label><input id={fid(`a21-${pi}`)} type="date" disabled={frozen} value={p.startDate} min="2000-01-01" max="2100-12-31" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, startDate: e.target.value } : x)))} className="input" /></div>
                  <div><label htmlFor={fid(`a22-${pi}`)} className="label">Başlangıç saati</label><input id={fid(`a22-${pi}`)} type="time" disabled={frozen} value={p.startTime} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, startTime: e.target.value } : x)))} className="input" /><p className="text-[11px] text-muted">Dönemin ilk günü bu saatte başlar</p></div>
                  <div><label htmlFor={fid(`a23-${pi}`)} className="label">Bitiş</label><input id={fid(`a23-${pi}`)} type="date" disabled={frozen} value={p.endDate} min={p.startDate || "2000-01-01"} max="2100-12-31" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, endDate: e.target.value } : x)))} className="input" /></div>
                  <div><label htmlFor={fid(`a24-${pi}`)} className="label">Kontenjan</label><input id={fid(`a24-${pi}`)} type="number" min={1} max={L.maxCapacity} disabled={frozen} value={p.capacity} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, capacity: Number(e.target.value) } : x)))} className="input" /></div>
                  <div className="lg:col-span-4"><label htmlFor={fid(`a25-${pi}`)} className="label">Açıklama</label><input id={fid(`a25-${pi}`)} disabled={frozen} value={p.description} maxLength={L.periodDescription} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, description: e.target.value } : x)))} className="input" /></div>
                </div>
                <p className="mt-3 text-xs font-semibold text-navy-800">Ders programı (canlı oturumlar)</p>
                <div className="mt-1 space-y-2">
                  {p.schedule.map((s, si) => (
                    <div key={si} className="grid gap-2 sm:grid-cols-[130px_90px_1fr_1fr_auto]">
                      <input aria-label="Oturum tarihi" type="date" disabled={frozen} value={s.date} min={p.startDate || undefined} max={p.endDate || undefined} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, date: e.target.value } : y)) } : x)))} className="input" />
                      <input aria-label="Oturum saati" type="time" disabled={frozen} value={s.time} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, time: e.target.value } : y)) } : x)))} className="input" />
                      <input aria-label="Başlık" disabled={frozen} value={s.title} maxLength={L.sessionTitle} placeholder="Başlık" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, title: e.target.value } : y)) } : x)))} className="input" />
                      <input aria-label="Zoom / Meet bağlantısı" disabled={passed} value={s.link} maxLength={L.url} placeholder="Zoom / Meet bağlantısı" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, link: e.target.value } : y)) } : x)))} className="input" />
                      {!frozen ? <button aria-label="Oturumu sil" onClick={() => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.filter((_, k) => k !== si) } : x)))} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Icon name="x" className="size-4" /></button> : <span />}
                    </div>
                  ))}
                  {!frozen && <button onClick={() => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: [...x.schedule, { date: "", time: "", title: "", link: "", notes: "" }] } : x)))} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> Oturum ekle</button>}
                </div>
              </div>
            );
          })}
          {!locked && <button onClick={() => addPeriod()} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> {c.type === "meeting" ? "Koltuk ekle" : "Dönem ekle"}</button>}
          {!locked && c.type === "meeting" && c.periods.length > 0 && <button onClick={() => { if (confirm("Tüm koltuklar listeden kaldırılsın mı? (Kayıtlı öğrencisi olan koltuklar kaydedilirken korunur.)")) set("periods", []); }} className="btn-secondary btn-sm text-red-600">Tümünü temizle</button>}
        </div>
      </Section>

      {/* Kategoriler (yalnızca admin): header "Eğitimler" menüsü ve /kategori sayfaları */}
      {isAdmin && (
        <Section title="Kategoriler" hint="Eğitim, seçilen kategorilerin sayfasında ve sitenin Eğitimler menüsünde listelenir. Birden fazla kategori seçebilirsin. Kategoriler Yönetici → Kategoriler'den tanımlanır.">
          {categories.length === 0 ? (
            <p className="text-sm text-muted">Henüz kategori yok. Önce <a href="/admin/kategoriler" className="text-sky-600 underline">Kategoriler</a> sayfasından ekle.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((k) => {
                const on = (c.categoryIds ?? []).includes(k.id);
                return (
                  <label key={k.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800 hover:border-navy-300"}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => set("categoryIds", e.target.checked ? [...(c.categoryIds ?? []), k.id] : (c.categoryIds ?? []).filter((x) => x !== k.id))} />
                    {k.name}
                  </label>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* Öne çıkan eğitim (yalnızca admin): program sayfasında eğitmen künyesinden sonra yatay kart */}
      {isAdmin && (
        <Section title="Eğitim Sayfasında Öne Çıkan Eğitim" hint="Bu eğitimin sayfasında, eğitmen künyesinden hemen sonra tek bir eğitim yatay kart olarak gösterilir (örneğin eğitmenin mentorluk / birebir görüşme ürünü). Eğitim seçmezsen bölüm görünmez.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fid("a26")} className="label">Gösterilecek eğitim</label>
              <select id={fid("a26")} value={c.promoCourseId ?? 0} onChange={(e) => set("promoCourseId", Number(e.target.value) || null)} className="input">
                <option value={0}>Yok (bölüm gösterilmez)</option>
                {allCourses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">Yalnızca yayında olan ve kapalı olmayan eğitim sitede görünür.</p>
            </div>
            <div>
              <label htmlFor={fid("a27")} className="label">Bölüm başlığı</label>
              <input id={fid("a27")} value={c.promoTitle ?? ""} onChange={(e) => set("promoTitle", e.target.value)} maxLength={120} disabled={!c.promoCourseId} className="input" placeholder="Bu eğitmenden mentorluk al" />
              <p className="mt-1 text-xs text-muted">Boş bırakılırsa &quot;Bu eğitmenden mentorluk al&quot; yazar.</p>
            </div>
          </div>
        </Section>
      )}

      {/* Kurs önerileri (yalnızca admin): tamamlayan/satın alan öğrenciye panelde önerilir */}
      {isAdmin && (
        <Section title="Kurs Önerileri (İlişkili Kurslar)" hint="Bu kursu tamamlayan ya da satın alan öğrenciye panelindeki tanıtım alanında önerilecek kurslar. İndirim yüzdesi o öğrenciye özeldir ve sepette otomatik uygulanır.">
          <div className="space-y-2">
            {(c.relations ?? []).map((r, ri) => (
              <div key={ri} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_170px_110px_1fr_auto]">
                <select aria-label="Önerilen eğitim" value={r.relatedCourseId} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, relatedCourseId: Number(e.target.value) } : x)))} className="input">
                  <option value={0}>Kurs seç</option>
                  {allCourses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
                <select aria-label="Öneri koşulu" value={r.trigger} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, trigger: e.target.value as "completed" | "purchased" } : x)))} className="input">
                  <option value="completed">Kursu bitirince öner</option>
                  <option value="purchased">Satın alınca öner</option>
                </select>
                <div className="flex items-center gap-1"><input aria-label="İndirim yüzdesi" type="number" min={0} max={100} value={r.discountPercent} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, discountPercent: Number(e.target.value) } : x)))} className="input" /><span className="text-sm text-muted">%</span></div>
                <input aria-label="Kısa mesaj" value={r.note} maxLength={L.note} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, note: e.target.value } : x)))} placeholder="Kısa mesaj (isteğe bağlı)" className="input" />
                <button onClick={() => set("relations", (c.relations ?? []).filter((_, j) => j !== ri))} className="rounded p-1.5 text-red-600 hover:bg-red-50 self-center" title="Kaldır"><Icon name="trash" className="size-4" /></button>
              </div>
            ))}
            <button onClick={() => set("relations", [...(c.relations ?? []), { relatedCourseId: 0, trigger: "completed" as const, discountPercent: 0, note: "" }])} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> Öneri ekle</button>
            <p className="text-xs text-muted">İndirim %0 ise kurs indirimsiz önerilir. &quot;Kursu bitirince&quot; önerileri panelde önceliklidir.</p>
          </div>
        </Section>
      )}

      {/* Yayınlama sihirbazı */}
      {publishStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6">
            {publishStep === 1 && (
              <>
                <h3 className="text-lg font-bold text-navy-800">Eğitim adı doğru mu?</h3>
                <p className="mt-2 text-xl text-navy-800">{c.title || "(başlık yok)"}</p>
              </>
            )}
            {publishStep === 2 && (
              <>
                <h3 className="text-lg font-bold text-navy-800">Müfredat özeti</h3>
                <p className="mt-2 text-sm text-muted">{counts.modules} modül · {counts.videos} video · {counts.quizzes} sınav · {counts.assigns} görev · {counts.files} dosya</p>
                <ul className="mt-2 list-disc pl-5 text-sm">{c.modules.map((m, i) => <li key={i}>{m.title} ({m.lessons.length})</li>)}</ul>
              </>
            )}
            {publishStep === 3 && (
              <>
                <h3 className="text-lg font-bold text-navy-800">{c.periods.length ? "Takvimli program" : "Esnek program"}</h3>
                <p className="mt-2 text-sm text-muted">{c.periods.length ? `${c.periods.length} dönem tanımlı. Yayınlandıktan sonra dönem tarihleri değiştirilemez.` : "Dönem yok; öğrenciler istedikleri zaman başlar."}</p>
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{isAdmin ? "Yönetici olarak yayından sonra da düzenleyebilirsin." : "Yayına aldıktan sonra müfredat ve tarihler kilitlenir; yalnızca oturum bağlantılarını güncelleyebilirsin."}</p>
              </>
            )}
            <div className="mt-6 flex justify-between">
              <button onClick={() => setPublishStep(0)} className="btn-secondary btn-sm">İptal</button>
              {publishStep < 3 ? (
                <button onClick={() => setPublishStep(publishStep + 1)} className="btn-primary btn-sm">Devam</button>
              ) : (
                <button onClick={() => save("published")} disabled={pending} className="btn-primary btn-sm">{pending ? "Yayınlanıyor…" : "Yayınla"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifyPeriodButton({ periodId }: { periodId: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-2 text-xs">
      {msg && <span className="text-emerald-700">{msg}</span>}
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await notifyPeriodStudents(periodId); setMsg(r.ok ? r.message ?? "Bildirildi" : r.error); })} className="btn-secondary btn-sm"><Icon name="bell" className="size-3.5" /> {pending ? "…" : "Öğrencilere bildir"}</button>
    </span>
  );
}

function QuizBuilder({ lesson, hasPeriods, onChange }: { lesson: Lesson; hasPeriods: boolean; onChange: (l: Lesson) => void }) {
  const [open, setOpen] = useState(false);
  const setQ = (i: number, q: Question) => onChange({ ...lesson, questions: lesson.questions.map((x, j) => (j === i ? q : x)) });
  return (
    <div className="mt-2">
      <textarea aria-label="Sınav açıklaması" rows={2} value={lesson.description} onChange={(e) => onChange({ ...lesson, description: e.target.value })} placeholder="Sınav açıklaması (isteğe bağlı)" className="input mb-2" />
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={lesson.shuffleQuestions} onChange={(e) => onChange({ ...lesson, shuffleQuestions: e.target.checked })} /> Soruları karıştır</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={lesson.showCorrectAnswers} onChange={(e) => onChange({ ...lesson, showCorrectAnswers: e.target.checked })} /> Sonuçta doğru cevapları göster</label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {hasPeriods ? (
          <div>
            <div className="flex gap-1">
              <input aria-label="Son tarih" type="date" value={lesson.dueDate} onChange={(e) => onChange({ ...lesson, dueDate: e.target.value, dueDays: 0 })} className="input" />
              <input aria-label="Son saat" type="time" value={lesson.dueTime} onChange={(e) => onChange({ ...lesson, dueTime: e.target.value })} className="input w-28" />
            </div>
            <p className="text-[11px] text-muted">Son tarih · boş = süresiz · saat boş = 23:59</p>
          </div>
        ) : (
          <div><input aria-label="Süre (gün)" type="number" min={0} value={lesson.dueDays} onChange={(e) => onChange({ ...lesson, dueDays: Number(e.target.value) })} className="input" /><p className="text-[11px] text-muted">Süre (gün) · 0 = süresiz</p></div>
        )}
        <div><input aria-label="Geçme notu (%)" type="number" min={0} max={100} value={lesson.passScore} onChange={(e) => onChange({ ...lesson, passScore: Number(e.target.value) })} className="input" /><p className="text-[11px] text-muted">Geçme notu % · 0 = otomatik geçer</p></div>
        <div><input aria-label="Deneme hakkı" type="number" min={0} max={100} value={lesson.maxAttempts} onChange={(e) => onChange({ ...lesson, maxAttempts: Number(e.target.value) })} className="input" /><p className="text-[11px] text-muted">Deneme hakkı · 0 = sınırsız</p></div>
      </div>
      <p className="mb-1 text-[11px] text-muted">
        Test ve doğru/yanlış sorular otomatik değerlendirilir; öğrenci her sorudan sonra doğru cevabı ve açıklamayı anında görür, kontrol ettiği cevabı değiştiremez. Geçme notu varsa altında kalan öğrencinin sınavı tamamlanmış sayılmaz (eğitim %100 olmaz, otomatik sertifika verilmez); deneme hakkı varsa yeniden çözer, hakkı bitince sonraki derslere devam eder. Sonuç listesinden “Yeni deneme hakkı ver” ile ek hak tanımlayabilirsin. Açık uçlu sorular aynı sınavda yer alabilir ancak puanlanmaz (yalnızca kaydedilir, eğitmen değerlendirmesi yoktur).
      </p>
      <button onClick={() => setOpen(!open)} className="mt-2 text-sm font-semibold text-navy-800">{open ? "▾" : "▸"} Sorular ({lesson.questions.filter((q) => q.text).length})</button>
      {open && (
        <div className="mt-2 space-y-3">
          {lesson.questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-line bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted">{i + 1}.</span>
                <select aria-label="Soru türü" value={q.qtype} onChange={(e) => setQ(i, { ...q, qtype: e.target.value as Question["qtype"], correct: e.target.value === "true_false" ? "true" : 0 })} className="input w-auto">
                  <option value="multiple_choice">Çoktan seçmeli</option><option value="true_false">Doğru / Yanlış</option><option value="open_ended">Açık uçlu</option>
                </select>
                <input type="number" min={1} value={q.points} onChange={(e) => setQ(i, { ...q, points: Number(e.target.value) })} className="input w-20" title="Puan" />
                <button aria-label="Soruyu sil" onClick={() => onChange({ ...lesson, questions: lesson.questions.filter((_, j) => j !== i) })} className="ml-auto rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
              </div>
              <textarea aria-label="Soru metni" rows={2} value={q.text} maxLength={L.questionText} onChange={(e) => setQ(i, { ...q, text: e.target.value })} placeholder="Soru metni" className="input mt-2" />
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <input aria-label="Görsel URL" value={q.image ?? ""} onChange={(e) => setQ(i, { ...q, image: e.target.value })} placeholder="Görsel URL (isteğe bağlı)" className="input text-xs" />
                <input aria-label="Açıklama" value={q.explanation} maxLength={L.explanation} onChange={(e) => setQ(i, { ...q, explanation: e.target.value })} placeholder="Açıklama (sonuçta gösterilir)" className="input text-xs" />
              </div>
              {q.qtype === "multiple_choice" && (
                <div className="mt-2 space-y-1">
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input type="radio" name={`c-${i}`} checked={Number(q.correct) === oi} onChange={() => setQ(i, { ...q, correct: oi })} title="Doğru şık" />
                      <input aria-label={`Şık ${String.fromCharCode(65 + oi)}`} value={o} onChange={(e) => setQ(i, { ...q, options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} maxLength={L.optionText} placeholder={`Şık ${String.fromCharCode(65 + oi)}`} className="input" />
                      <button aria-label="Şıkkı sil" onClick={() => setQ(i, { ...q, options: q.options.filter((_, k) => k !== oi), correct: Number(q.correct) === oi ? 0 : Number(q.correct) > oi ? Number(q.correct) - 1 : q.correct })} className="text-muted"><Icon name="x" className="size-4" /></button>
                    </div>
                  ))}
                  <button onClick={() => setQ(i, { ...q, options: [...q.options, ""] })} className="text-xs text-sky-600">+ Şık ekle</button>
                </div>
              )}
              {q.qtype === "true_false" && (
                <div className="mt-2 flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="radio" checked={String(q.correct) === "true"} onChange={() => setQ(i, { ...q, correct: "true" })} /> Doğru</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={String(q.correct) === "false"} onChange={() => setQ(i, { ...q, correct: "false" })} /> Yanlış</label>
                </div>
              )}
              {q.qtype === "open_ended" && <p className="mt-1 text-xs text-muted">Açık uçlu sorular puanlanmaz; yalnızca kaydedilir. Öğrenci çözerken doğru/yanlış görmez.</p>}
            </div>
          ))}
          <button onClick={() => onChange({ ...lesson, questions: [...lesson.questions, newQuestion()] })} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> Soru ekle</button>
        </div>
      )}
    </div>
  );
}

/** Koltuk üretici: günler + saat aralığı + süre → periyot listesi (her koltuk kapasiteli bir dönem) */
function SlotGenerator({ minutes, link, onGenerate }: { minutes: number; link: string; onGenerate: (slots: ReturnType<typeof generateSlots>) => void }) {
  const fid = useFieldId();
  const [dates, setDates] = useState<string[]>([""]);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:30");
  const [gap, setGap] = useState(0);
  const [weeks, setWeeks] = useState(1);
  const [capacity, setCapacity] = useState(1);
  const preview = generateSlots({ dates, startTime, endTime, minutes, gap, weeks, capacity, link });
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold text-navy-800">Koltuk üretici</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <p id={fid("gunler")} className="label">Günler</p>
          <div role="group" aria-labelledby={fid("gunler")} className="flex flex-wrap gap-2">
            {dates.map((d, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="date" aria-label={`${i + 1}. gün`} value={d} onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} className="input w-auto" />
                {dates.length > 1 && <button type="button" aria-label={`${i + 1}. günü kaldır`} onClick={() => setDates(dates.filter((_, j) => j !== i))} className="rounded p-1 text-red-600 hover:bg-white"><Icon name="x" className="size-4" /></button>}
              </span>
            ))}
            <button type="button" onClick={() => setDates([...dates, ""])} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> Gün ekle</button>
          </div>
        </div>
        <div><label htmlFor={fid("a28")} className="label">İlk görüşme</label><input id={fid("a28")} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" /></div>
        <div><label htmlFor={fid("a29")} className="label">Son bitiş</label><input id={fid("a29")} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" /></div>
        <div><label htmlFor={fid("a30")} className="label">Görüşmeler arası ara (dk)</label><input id={fid("a30")} type="number" min={0} step={5} value={gap} onChange={(e) => setGap(Number(e.target.value))} className="input" /></div>
        <div><label htmlFor={fid("a31")} className="label">Haftalık tekrar (hafta)</label><input id={fid("a31")} type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="input" /><p className="text-[11px] text-muted">1 = tek görüşme; 3 = aynı gün/saatte 3 hafta</p></div>
        <div><label htmlFor={fid("a32")} className="label">Koltuk başına kontenjan</label><input id={fid("a32")} type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="input" /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!preview.length || minutes < 5} onClick={() => onGenerate(preview)} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> {preview.length} koltuk üret</button>
        <span className="text-xs text-muted">{minutes < 5 ? "Önce görüşme süresini gir." : preview.length ? `${preview.length} koltuk · ${dates.filter(Boolean).length} gün · ${weeks > 1 ? `${weeks} haftalık, ` : ""}${minutes} dk` : "Gün ve saat aralığı gir."}</span>
      </div>
    </div>
  );
}
