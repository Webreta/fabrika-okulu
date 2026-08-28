"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseInput } from "@/lib/course-save";
import { saveCourseAction, uploadCourseImage, uploadProtectedFile, notifyPeriodStudents } from "@/app/actions/teacher";
import { Icon } from "@/components/site/Icon";

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

const TEMPLATES: Record<string, Module[]> = {
  standart: [
    { title: "Modül 1: Giriş", lessons: [newLesson("video"), newLesson("video")] },
    { title: "Modül 2: Derinleşme", lessons: [newLesson("video"), newLesson("quiz"), newLesson("assign")] },
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-bold text-navy-800">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function CourseEditor({
  initial, locked, isAdmin, instructors, periodEnrolled = {}, backHref, allCourses = [],
}: {
  initial: CourseInput; locked: boolean; isAdmin: boolean;
  instructors: { id: number; name: string }[]; periodEnrolled?: Record<number, number>; backHref: string;
  allCourses?: { id: number; title: string }[];
}) {
  const [c, setC] = useState<CourseInput>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [publishStep, setPublishStep] = useState(0);
  const [busy, setBusy] = useState("");
  const router = useRouter();
  const isNew = !c.id;
  const isAdminShell = backHref.startsWith("/admin");
  const today = new Date().toISOString().slice(0, 10);
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

  const save = (status: "draft" | "published") =>
    start(async () => {
      setMsg(null);
      const r = await saveCourseAction({ ...c, status: locked ? c.status : status, relations: c.relations?.filter((x) => x.relatedCourseId > 0) });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: r.message ?? "Kaydedildi." });
      setPublishStep(0);
      if (isNew && r.id) router.replace(`${backHref}/editor/${r.id}`);
      else router.refresh();
    });

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
      <div className={`sticky z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 shadow-sm lg:px-8 ${isAdminShell ? "top-0 -mx-4 -mt-4 lg:-mx-8 lg:-mt-8" : "top-[110px] -mx-4 -mt-6 lg:-mx-6 lg:-mt-7"}`}>
        <div>
          <h1 className="text-lg font-bold text-navy-800">{isNew ? "Yeni Eğitim" : c.title || "Eğitim"}</h1>
          <p className="text-xs text-muted">{locked ? "Yayında — müfredat ve dönemler kilitli, yalnızca oturum linkleri güncellenebilir." : c.status === "published" ? "Yayında (yönetici düzenlemesi)" : "Taslak"}</p>
        </div>
        {msg && (
          <div className={`absolute right-4 top-full mt-2 z-50 flex max-w-[min(90vw,520px)] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg lg:right-8 ${msg.ok ? "bg-emerald-600 text-[#fff]" : "bg-red-600 text-[#fff]"}`} role="status">
            <Icon name={msg.ok ? "check" : "alert"} className="size-4 shrink-0" /> <span>{msg.text}</span>
            {!msg.ok && <button onClick={() => setMsg(null)} className="ml-2 opacity-80 hover:opacity-100" aria-label="Kapat"><Icon name="x" className="size-4" /></button>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!isNew && <Link href={`/kurs-izle/${c.id}`} target="_blank" className="btn-secondary btn-sm"><Icon name="play" className="size-4" /> Player önizle</Link>}
          {locked ? (
            <button onClick={() => save("published")} disabled={pending} className="btn-primary btn-sm">{pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button>
          ) : (
            <>
              <button onClick={() => save("draft")} disabled={pending} className="btn-secondary btn-sm"><Icon name="save" className="size-4" /> Taslak kaydet</button>
              <button onClick={() => (c.status === "published" ? save("published") : setPublishStep(1))} disabled={pending} className="btn-primary btn-sm"><Icon name="check" className="size-4" /> {c.status === "published" ? "Kaydet" : "Yayınla"}</button>
            </>
          )}
        </div>
      </div>


      {isNew && c.modules.length === 0 && (
        <Section title="Şablondan başla" hint="Bir şablon seç, sonra istediğin gibi düzenle.">
          <div className="grid gap-3 sm:grid-cols-3">
            {[["standart", "Standart", "2 modül · video + sınav + görev"], ["donemli", "Dönemli", "Temeller + canlı oturumlar"], ["atolye", "Atölye", "Uygulama ağırlıklı görevler"]].map(([k, l, d]) => (
              <button key={k} onClick={() => set("modules", structuredClone(TEMPLATES[k]))} className="rounded-xl border border-line p-4 text-left hover:border-sky-400 hover:bg-sky-50">
                <p className="font-semibold text-navy-800">{l}</p><p className="text-xs text-muted">{d}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Genel Bilgiler">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label">Eğitim başlığı *</label><input value={c.title} onChange={(e) => set("title", e.target.value)} className="input" /></div>
          <div className="md:col-span-2"><label className="label">Kısa açıklama</label><textarea rows={2} value={c.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="input" /></div>
          <div className="md:col-span-2">
            <label className="label">Açıklama <span className="text-muted">(HTML kullanılabilir: &lt;p&gt;, &lt;h3&gt;, &lt;ul&gt;)</span></label>
            <textarea rows={6} value={c.description} onChange={(e) => set("description", e.target.value)} className="input font-mono text-xs" />
          </div>
          <div>
            <label className="label">Kapak görseli</label>
            <div className="flex items-center gap-3">
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" /> : <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-surface text-muted"><Icon name="upload" className="size-5" /></div>}
              <label className="btn-secondary btn-sm cursor-pointer">{busy === "cover" ? "Yükleniyor…" : "Görsel seç"}<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCover(e.target.files?.[0])} /></label>
              {c.imageUrl && <button onClick={() => set("imageUrl", "")} className="text-xs text-red-600">Kaldır</button>}
            </div>
          </div>
          <div><label className="label">Önizleme videosu (URL)</label><input value={c.previewVideo} onChange={(e) => set("previewVideo", e.target.value)} className="input" placeholder="YouTube / Vimeo" /></div>
          <div><label className="label">Seviye</label>
            <select value={c.level} onChange={(e) => set("level", e.target.value)} className="input">
              <option value="all">Tüm Seviyeler</option><option value="beginner">Başlangıç</option><option value="intermediate">Orta</option><option value="advanced">İleri</option>
            </select>
          </div>
          <div><label className="label">Dil</label><input value={c.language} onChange={(e) => set("language", e.target.value)} className="input" /></div>
          <div className="flex flex-wrap gap-5 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.hasCertificate} onChange={(e) => set("hasCertificate", e.target.checked)} /> Sertifika verilir</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.lifetime} onChange={(e) => set("lifetime", e.target.checked)} /> Ömür boyu erişim</label>
            {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.featured} onChange={(e) => set("featured", e.target.checked)} /> Öne çıkan</label>}
            {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.closed} onChange={(e) => set("closed", e.target.checked)} /> Kapalı (satış yok)</label>}
          </div>
          {isAdmin && (
            <>
              <div><label className="label">Eğitmen</label>
                <select value={c.instructorId ?? ""} onChange={(e) => set("instructorId", e.target.value ? Number(e.target.value) : null)} className="input">
                  <option value="">— Seçiniz —</option>{instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div><label className="label">Buton tipi</label>
                <select value={c.buttonType} onChange={(e) => set("buttonType", e.target.value)} className="input"><option value="cart">Sepete ekle</option><option value="whatsapp">WhatsApp</option><option value="both">İkisi</option></select>
              </div>
              {c.buttonType !== "cart" && (
                <>
                  <div><label className="label">WhatsApp numarası (kurs özel)</label><input value={c.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} className="input" placeholder="905xxxxxxxxx" /></div>
                  <div><label className="label">WhatsApp mesajı</label><input value={c.whatsappMessage ?? ""} onChange={(e) => set("whatsappMessage", e.target.value)} className="input" placeholder="{course_name} {course_price}" /></div>
                </>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Kazanımlar & İçerik">
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label">Kazanımlar (her satıra bir tane)</label><textarea rows={6} value={c.outcomes.join("\n")} onChange={(e) => set("outcomes", e.target.value.split("\n"))} className="input" /></div>
          <div><label className="label">Gereksinimler</label><textarea rows={6} value={c.requirements} onChange={(e) => set("requirements", e.target.value)} className="input" /></div>
          <div><label className="label">Hedef kitle</label><textarea rows={6} value={c.target} onChange={(e) => set("target", e.target.value)} className="input" /></div>
        </div>
      </Section>

      <Section title="Fiyatlandırma">
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={c.isFree} onChange={(e) => set("isFree", e.target.checked)} /> Ücretsiz eğitim</label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Fiyat ₺</label><input type="number" min={0} step="0.01" disabled={c.isFree} value={c.price} onChange={(e) => set("price", Number(e.target.value))} className="input" /></div>
          <div><label className="label">İndirimli fiyat ₺</label><input type="number" min={0} step="0.01" disabled={c.isFree} value={c.salePrice} onChange={(e) => set("salePrice", Number(e.target.value))} className="input" /></div>
          <div><label className="label">İndirim bitiş tarihi</label><input type="date" disabled={c.isFree} value={c.saleTo} onChange={(e) => set("saleTo", e.target.value)} className="input" /></div>
        </div>
      </Section>

      {/* Müfredat */}
      <Section title="Müfredat" hint={locked ? "Yayındaki müfredat kilitli." : `${counts.modules} modül · ${counts.videos} video · ${counts.quizzes} sınav · ${counts.assigns} görev · ${counts.files} dosya`}>
        <div className={`space-y-4 ${locked ? "pointer-events-none opacity-70" : ""}`}>
          {c.modules.map((m, mi) => (
            <div key={mi} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted">Modül {mi + 1}</span>
                <input value={m.title} onChange={(e) => setModule(mi, { ...m, title: e.target.value })} placeholder="Modül başlığı" className="input flex-1" />
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
                        <input value={l.title} onChange={(e) => setLesson(mi, li, { ...l, title: e.target.value })} placeholder={`${meta.label} başlığı`} className="input flex-1" />
                        <button onClick={() => setModule(mi, { ...m, lessons: move(m.lessons, li, -1) })} className="rounded p-1 hover:bg-surface"><Icon name="chevronUp" className="size-4" /></button>
                        <button onClick={() => setModule(mi, { ...m, lessons: move(m.lessons, li, 1) })} className="rounded p-1 hover:bg-surface"><Icon name="chevronDown" className="size-4" /></button>
                        <button onClick={() => setModule(mi, { ...m, lessons: m.lessons.filter((_, j) => j !== li) })} className="rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
                      </div>
                      {l.type === "video" && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                          <input value={l.videoUrl} onChange={(e) => setLesson(mi, li, { ...l, videoUrl: e.target.value })} placeholder="Video URL (YouTube / Vimeo / mp4)" className="input" />
                          <input value={l.duration} onChange={(e) => setLesson(mi, li, { ...l, duration: e.target.value })} placeholder="dk:sn" className="input" />
                          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.preview} onChange={(e) => setLesson(mi, li, { ...l, preview: e.target.checked })} /> Önizleme</label>
                          <textarea rows={2} value={l.description} onChange={(e) => setLesson(mi, li, { ...l, description: e.target.value })} placeholder="Ders açıklaması (isteğe bağlı)" className="input sm:col-span-3" />
                        </div>
                      )}
                      {l.type === "assign" && (
                        <div className={`mt-2 grid gap-2 ${hasPeriods ? "sm:grid-cols-[1fr_260px]" : "sm:grid-cols-[1fr_160px]"}`}>
                          <textarea rows={2} value={l.description} onChange={(e) => setLesson(mi, li, { ...l, description: e.target.value })} placeholder="Görev açıklaması" className="input" />
                          {hasPeriods ? (
                            <div>
                              <div className="flex gap-1">
                                <input type="date" value={l.dueDate} onChange={(e) => setLesson(mi, li, { ...l, dueDate: e.target.value, dueDays: 0 })} className="input" />
                                <input type="time" value={l.dueTime} onChange={(e) => setLesson(mi, li, { ...l, dueTime: e.target.value })} className="input w-28" />
                              </div>
                              <p className="mt-1 text-[11px] text-muted">Son teslim tarihi · boş = süresiz · saat boş = 23:59</p>
                            </div>
                          ) : (
                            <div><input type="number" min={0} value={l.dueDays} onChange={(e) => setLesson(mi, li, { ...l, dueDays: Number(e.target.value) })} className="input" /><p className="mt-1 text-[11px] text-muted">Teslim süresi (gün) · 0 = süresiz</p></div>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-xs sm:col-span-2">
                            <label className="flex items-center gap-1"><input type="checkbox" checked={l.isGraded} onChange={(e) => setLesson(mi, li, { ...l, isGraded: e.target.checked })} /> Puanlı</label>
                            {l.isGraded && <span className="flex items-center gap-1">Maks puan <input type="number" min={1} value={l.maxScore} onChange={(e) => setLesson(mi, li, { ...l, maxScore: Number(e.target.value) })} className="input w-20 py-0.5" /></span>}
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
      </Section>

      {/* Dönemler */}
      <Section title="Dönemler" hint={locked ? "Yayında: yalnızca gelecek oturumların bağlantıları düzenlenebilir." : "Dönem eklersen eğitim 'Takvimli Program' olur. Görev/sınav son teslim tarihleri müfredatta ders üzerinde tarih olarak girilir."}>
        <div className="space-y-4">
          {c.periods.map((p, pi) => {
            const passed = !!p.endDate && p.endDate < today;
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
                  <div className="lg:col-span-2"><label className="label">Ad</label><input disabled={frozen} value={p.name} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, name: e.target.value } : x)))} className="input" /></div>
                  <div><label className="label">Başlangıç</label><input type="date" disabled={frozen} value={p.startDate} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, startDate: e.target.value } : x)))} className="input" /></div>
                  <div><label className="label">Başlangıç saati</label><input type="time" disabled={frozen} value={p.startTime} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, startTime: e.target.value } : x)))} className="input" /><p className="text-[11px] text-muted">Dönemin ilk günü bu saatte başlar</p></div>
                  <div><label className="label">Bitiş</label><input type="date" disabled={frozen} value={p.endDate} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, endDate: e.target.value } : x)))} className="input" /></div>
                  <div><label className="label">Kontenjan</label><input type="number" min={1} disabled={frozen} value={p.capacity} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, capacity: Number(e.target.value) } : x)))} className="input" /></div>
                  <div className="lg:col-span-4"><label className="label">Açıklama</label><input disabled={frozen} value={p.description} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, description: e.target.value } : x)))} className="input" /></div>
                </div>
                <p className="mt-3 text-xs font-semibold text-navy-800">Ders programı (canlı oturumlar)</p>
                <div className="mt-1 space-y-2">
                  {p.schedule.map((s, si) => (
                    <div key={si} className="grid gap-2 sm:grid-cols-[130px_90px_1fr_1fr_auto]">
                      <input type="date" disabled={frozen} value={s.date} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, date: e.target.value } : y)) } : x)))} className="input" />
                      <input type="time" disabled={frozen} value={s.time} onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, time: e.target.value } : y)) } : x)))} className="input" />
                      <input disabled={frozen} value={s.title} placeholder="Başlık" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, title: e.target.value } : y)) } : x)))} className="input" />
                      <input disabled={passed} value={s.link} placeholder="Zoom / Meet bağlantısı" onChange={(e) => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.map((y, k) => (k === si ? { ...y, link: e.target.value } : y)) } : x)))} className="input" />
                      {!frozen ? <button onClick={() => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: x.schedule.filter((_, k) => k !== si) } : x)))} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Icon name="x" className="size-4" /></button> : <span />}
                    </div>
                  ))}
                  {!frozen && <button onClick={() => set("periods", c.periods.map((x, j) => (j === pi ? { ...x, schedule: [...x.schedule, { date: "", time: "", title: "", link: "", notes: "" }] } : x)))} className="btn-secondary btn-sm"><Icon name="plus" className="size-3.5" /> Oturum ekle</button>}
                </div>
              </div>
            );
          })}
          {!locked && <button onClick={() => set("periods", [...c.periods, newPeriod()])} className="btn-primary btn-sm"><Icon name="plus" className="size-4" /> Dönem ekle</button>}
        </div>
      </Section>

      {/* Kurs önerileri (yalnızca admin): tamamlayan/satın alan öğrenciye panelde önerilir */}
      {isAdmin && (
        <Section title="Kurs Önerileri (İlişkili Kurslar)" hint="Bu kursu tamamlayan ya da satın alan öğrenciye panelindeki tanıtım alanında önerilecek kurslar. İndirim yüzdesi o öğrenciye özeldir ve sepette otomatik uygulanır.">
          <div className="space-y-2">
            {(c.relations ?? []).map((r, ri) => (
              <div key={ri} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_170px_110px_1fr_auto]">
                <select value={r.relatedCourseId} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, relatedCourseId: Number(e.target.value) } : x)))} className="input">
                  <option value={0}>Kurs seç</option>
                  {allCourses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
                <select value={r.trigger} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, trigger: e.target.value as "completed" | "purchased" } : x)))} className="input">
                  <option value="completed">Kursu bitirince öner</option>
                  <option value="purchased">Satın alınca öner</option>
                </select>
                <div className="flex items-center gap-1"><input type="number" min={0} max={100} value={r.discountPercent} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, discountPercent: Number(e.target.value) } : x)))} className="input" /><span className="text-sm text-muted">%</span></div>
                <input value={r.note} onChange={(e) => set("relations", (c.relations ?? []).map((x, j) => (j === ri ? { ...x, note: e.target.value } : x)))} placeholder="Kısa mesaj (isteğe bağlı)" className="input" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
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
      <textarea rows={2} value={lesson.description} onChange={(e) => onChange({ ...lesson, description: e.target.value })} placeholder="Sınav açıklaması (isteğe bağlı)" className="input mb-2" />
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={lesson.shuffleQuestions} onChange={(e) => onChange({ ...lesson, shuffleQuestions: e.target.checked })} /> Soruları karıştır</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={lesson.showCorrectAnswers} onChange={(e) => onChange({ ...lesson, showCorrectAnswers: e.target.checked })} /> Sonuçta doğru cevapları göster</label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {hasPeriods ? (
          <div>
            <div className="flex gap-1">
              <input type="date" value={lesson.dueDate} onChange={(e) => onChange({ ...lesson, dueDate: e.target.value, dueDays: 0 })} className="input" />
              <input type="time" value={lesson.dueTime} onChange={(e) => onChange({ ...lesson, dueTime: e.target.value })} className="input w-28" />
            </div>
            <p className="text-[11px] text-muted">Son tarih · boş = süresiz · saat boş = 23:59</p>
          </div>
        ) : (
          <div><input type="number" min={0} value={lesson.dueDays} onChange={(e) => onChange({ ...lesson, dueDays: Number(e.target.value) })} className="input" /><p className="text-[11px] text-muted">Süre (gün) · 0 = süresiz</p></div>
        )}
        <div><input type="number" min={0} max={100} value={lesson.passScore} onChange={(e) => onChange({ ...lesson, passScore: Number(e.target.value) })} className="input" /><p className="text-[11px] text-muted">Geçme notu % · 0 = otomatik geçer</p></div>
      </div>
      <p className="mb-1 text-[11px] text-muted">
        Sınav tek deneme haklıdır. Test ve doğru/yanlış sorular otomatik değerlendirilir; öğrenci her sorudan sonra doğru cevabı ve açıklamayı anında görür. Açık uçlu sorular aynı sınavda yer alabilir ancak puanlanmaz (yalnızca kaydedilir, eğitmen değerlendirmesi yoktur).
      </p>
      <button onClick={() => setOpen(!open)} className="mt-2 text-sm font-semibold text-navy-800">{open ? "▾" : "▸"} Sorular ({lesson.questions.filter((q) => q.text).length})</button>
      {open && (
        <div className="mt-2 space-y-3">
          {lesson.questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-line bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted">{i + 1}.</span>
                <select value={q.qtype} onChange={(e) => setQ(i, { ...q, qtype: e.target.value as Question["qtype"], correct: e.target.value === "true_false" ? "true" : 0 })} className="input w-auto">
                  <option value="multiple_choice">Çoktan seçmeli</option><option value="true_false">Doğru / Yanlış</option><option value="open_ended">Açık uçlu</option>
                </select>
                <input type="number" min={1} value={q.points} onChange={(e) => setQ(i, { ...q, points: Number(e.target.value) })} className="input w-20" title="Puan" />
                <button onClick={() => onChange({ ...lesson, questions: lesson.questions.filter((_, j) => j !== i) })} className="ml-auto rounded p-1 text-red-600 hover:bg-red-50"><Icon name="trash" className="size-4" /></button>
              </div>
              <textarea rows={2} value={q.text} onChange={(e) => setQ(i, { ...q, text: e.target.value })} placeholder="Soru metni" className="input mt-2" />
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <input value={q.image ?? ""} onChange={(e) => setQ(i, { ...q, image: e.target.value })} placeholder="Görsel URL (isteğe bağlı)" className="input text-xs" />
                <input value={q.explanation} onChange={(e) => setQ(i, { ...q, explanation: e.target.value })} placeholder="Açıklama (sonuçta gösterilir)" className="input text-xs" />
              </div>
              {q.qtype === "multiple_choice" && (
                <div className="mt-2 space-y-1">
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input type="radio" name={`c-${i}`} checked={Number(q.correct) === oi} onChange={() => setQ(i, { ...q, correct: oi })} title="Doğru şık" />
                      <input value={o} onChange={(e) => setQ(i, { ...q, options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} placeholder={`Şık ${String.fromCharCode(65 + oi)}`} className="input" />
                      <button onClick={() => setQ(i, { ...q, options: q.options.filter((_, k) => k !== oi), correct: Number(q.correct) === oi ? 0 : Number(q.correct) > oi ? Number(q.correct) - 1 : q.correct })} className="text-muted"><Icon name="x" className="size-4" /></button>
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
