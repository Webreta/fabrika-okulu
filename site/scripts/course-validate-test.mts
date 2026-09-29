/**
 * Kurs editörü doğrulama testi (veritabanına yazmaz, e-posta göndermez).
 * Çalıştır: npx tsx --conditions=react-server scripts/course-validate-test.mts
 *
 * Denetlenenler: hatalı değerler sessizce düzeltilmez (hata döner), dönem tarihleri, uzunluk sınırları,
 * görev–dönem kuralı ve eğitmen kilidi (kilitli alanlar istekten değil kayıttan alınır).
 */
import { parseCourseInput, checkCourseAgainstStored, type CourseInput, type CourseLockInfo } from "../lib/course-save";
import { addDays, todayISO } from "../lib/format";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

const today = todayISO();
const lesson = (over: Record<string, unknown> = {}) => ({
  type: "video", title: "Ders", videoUrl: "", duration: "", preview: false, description: "", dueDays: 0, dueDate: "", dueTime: "", fileUrl: "", fileName: "", fileMime: "",
  questions: [], timeLimit: 0, passScore: 0, maxAttempts: 1, shuffleQuestions: false, showCorrectAnswers: true, isGraded: false, maxScore: 100, allowFile: true, allowVoice: true, allowText: true,
  ...over,
});
const period = (over: Record<string, unknown> = {}) => ({ name: "1. Dönem", startDate: addDays(today, 10), startTime: "19:00", endDate: addDays(today, 40), capacity: 20, description: "", schedule: [], ...over });
const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: "Doğrulama testi", shortDescription: "", description: "", imageUrl: "", status: "draft", isFree: false, price: 1000, salePrice: 0, saleTo: "",
  outcomes: [], requirements: "", target: "", previewVideo: "", level: "all", language: "Türkçe", hasCertificate: false, lifetime: true, buttonType: "cart",
  type: "course", meetingMinutes: 0, meetingLink: "", modules: [{ title: "Modül 1", lessons: [lesson()] }], periods: [], ...over,
});

const admin = { isAdmin: true, stored: null };
const teacher = { isAdmin: false, stored: null };
const err = (raw: unknown, opts: { isAdmin: boolean; stored: CourseLockInfo | null } = admin) => { const r = parseCourseInput(raw, opts); return r.ok ? "" : r.error; };
const has = (raw: unknown, ...parts: string[]) => { const e = err(raw); return { ok: parts.every((p) => e.includes(p)), e: e || "(hata dönmedi)" }; };
const expectErr = (name: string, raw: unknown, ...parts: string[]) => { const r = has(raw, ...parts); check(name, r.ok, r.e); };

async function main() {
  check("geçerli eğitim kabul edilir", err(base()) === "", err(base()));
  check("geçerli dönemli + görevli eğitim kabul edilir", err(base({ periods: [period()], modules: [{ title: "M", lessons: [lesson({ type: "assign" })] }] })) === "", err(base({ periods: [period()], modules: [{ title: "M", lessons: [lesson({ type: "assign" })] }] })));

  // O2 — sessiz düzeltme yok
  expectErr("eksi fiyat reddedilir", base({ price: -100 }), "Fiyat", "eksi olamaz");
  expectErr("sayı olmayan fiyat reddedilir", base({ price: "abc" }), "Fiyat", "sayı olmalı");
  expectErr("çok büyük fiyat reddedilir", base({ price: 99999999 }), "Fiyat", "en fazla");
  expectErr("indirimli fiyat > fiyat reddedilir", base({ price: 500, salePrice: 900 }), "İndirimli fiyat", "normal fiyattan düşük");
  expectErr("indirimli fiyat = fiyat reddedilir", base({ price: 500, salePrice: 500 }), "İndirimli fiyat");
  check("ücretsiz eğitimde fiyat alanları denetlenmez", err(base({ isFree: true, price: 0, salePrice: 900 })) === "");
  expectErr("kontenjan 0 reddedilir", base({ periods: [period({ capacity: 0 })] }), "Dönem 1", "Kontenjan", "en az 1");
  expectErr("öneri indirimi %150 reddedilir", base({ relations: [{ relatedCourseId: 5, trigger: "completed", discountPercent: 150, note: "" }] }), "Öneri 1", "İndirim yüzdesi", "en fazla 100");
  expectErr("geçme notu 120 reddedilir", base({ modules: [{ title: "M", lessons: [lesson({ type: "quiz", passScore: 120 })] }] }), "Geçme notu");
  expectErr("başlıksız modül reddedilir", base({ modules: [{ title: "", lessons: [lesson()] }] }), "Modül 1", "Başlık");
  expectErr("tek şıklı test sorusu reddedilir", base({ modules: [{ title: "M", lessons: [lesson({ type: "quiz", questions: [{ qtype: "multiple_choice", text: "Soru?", points: 1, options: ["A", "", "", ""], correct: 0 }] })] }] }), "Soru 1", "en az iki şık");
  expectErr("doğru şık boş şıkkı gösteriyorsa reddedilir", base({ modules: [{ title: "M", lessons: [lesson({ type: "quiz", questions: [{ qtype: "multiple_choice", text: "Soru?", points: 1, options: ["A", "B", "", ""], correct: 3 }] })] }] }), "Soru 1", "Doğru şık");

  // O3 — dönem tarihleri
  expectErr("bitişi başlangıcından önce olan dönem reddedilir", base({ periods: [period({ startDate: addDays(today, 40), endDate: addDays(today, 10) })] }), "Dönem 1", "Bitiş", "başlangıç tarihinden önce");
  expectErr("eksik dönem reddedilir", base({ periods: [period({ startDate: "" })] }), "Dönem 1", "zorunlu");
  expectErr("geçersiz tarih reddedilir", base({ periods: [period({ startDate: "2026-02-31" })] }), "Dönem 1", "Başlangıç", "geçerli bir tarih değil");
  expectErr("anlamsız yıl reddedilir", base({ periods: [period({ startDate: "0002-01-01", endDate: "0002-02-01" })] }), "geçerli bir tarih değil");
  expectErr("geçersiz saat reddedilir", base({ periods: [period({ startTime: "25:99" })] }), "Başlangıç saati", "geçerli bir saat değil");
  expectErr("dönem dışındaki oturum reddedilir", base({ periods: [period({ schedule: [{ date: addDays(today, 90), time: "19:00", title: "Canlı", link: "", notes: "" }] })] }), "Oturum 1", "Tarih", "arasında olmalı");
  expectErr("tarihsiz dolu oturum reddedilir", base({ periods: [period({ schedule: [{ date: "", time: "19:00", title: "Canlı", link: "", notes: "" }] })] }), "Oturum 1", "gerekli");
  check("tümüyle boş oturum satırı kaydı engellemez", err(base({ periods: [period({ schedule: [{ date: "", time: "", title: "", link: "", notes: "" }] })] })) === "");
  expectErr("koltuk adıyla yazılır (görüşme ürünü)", base({ type: "meeting", modules: [], periods: [period({ capacity: 0 })] }), "Koltuk 1");
  {
    const past = parseCourseInput(base({ periods: [period({ startDate: addDays(today, -60), endDate: addDays(today, -30) })] }), admin);
    const e = past.ok ? await checkCourseAgainstStored(past.input) : "doğrulama hatası: " + past.error;
    check("tümüyle geçmişteki YENİ dönem reddedilir", !!e && e.includes("geçmişte"), e ?? "(hata dönmedi)");
    const running = parseCourseInput(base({ periods: [period({ startDate: addDays(today, -5), endDate: addDays(today, 20) })] }), admin);
    check("başlamış ama bitmemiş yeni dönem kabul edilir", running.ok && (await checkCourseAgainstStored(running.input)) === null);
  }

  // O4 — görev/dönem
  expectErr("dönemsiz görev: yönlendiren mesaj", base({ modules: [{ title: "M", lessons: [lesson(), lesson({ type: "assign" })] }] }), "Modül 1", "İçerik 2", "Dönemler", "dönem ekle");

  // O5 — uzunluk sınırları
  expectErr("151 karakterlik başlık reddedilir", base({ title: "a".repeat(151) }), "Başlık", "en fazla 150 karakter");
  check("150 karakterlik başlık kabul edilir", err(base({ title: "a".repeat(150) })) === "");
  expectErr("301 karakterlik kısa açıklama reddedilir", base({ shortDescription: "a".repeat(301) }), "Kısa açıklama", "en fazla 300");
  expectErr("uzun modül başlığı reddedilir", base({ modules: [{ title: "a".repeat(151), lessons: [] }] }), "Modül 1", "Başlık");
  expectErr("uzun ders başlığı reddedilir", base({ modules: [{ title: "M", lessons: [lesson({ title: "a".repeat(201) })] }] }), "İçerik 1", "Başlık", "en fazla 200");
  expectErr("uzun dönem adı reddedilir", base({ periods: [period({ name: "a".repeat(101) })] }), "Dönem 1", "Ad", "en fazla 100");
  expectErr("uzun kazanım satırı reddedilir", base({ outcomes: ["kısa", "a".repeat(301)] }), "Kazanımlar", "2. satır");

  // O1 — eğitmen kilidi
  const stored: CourseLockInfo = { status: "published", type: "course", buttonType: "cart", students: 3, teacherLocked: true };
  {
    const r = parseCourseInput(base({ id: 7, status: "draft", type: "meeting", buttonType: "whatsapp", modules: [], periods: [] }), { isAdmin: false, stored });
    check("kilitli: yayındaki eğitim taslağa çekilemez", r.ok && r.input.status === "published", r.ok ? r.input.status : r.error);
    check("kilitli: eğitim türü değiştirilemez", r.ok && r.input.type === "course");
    check("kilitli: satış düğmesi değiştirilemez", r.ok && r.input.buttonType === "cart");
    check("kilitli olduğu bildirilir", r.ok && r.locked === true);
  }
  {
    const r = parseCourseInput(base({ id: 7, status: "published", periods: [{ id: 11, name: "", startDate: "bozuk", endDate: "", capacity: 0, schedule: [{ date: "x", link: "https://zoom.us/j/1" }] }] }), { isAdmin: false, stored });
    check("kilitli: dönem verisi doğrulanmaz, yalnızca bağlantı okunur", r.ok && r.input.periods.length === 0 && r.links[0]?.id === 11 && r.links[0]?.schedule[0]?.link === "https://zoom.us/j/1", r.ok ? JSON.stringify(r.links) : r.error);
  }
  {
    const r = parseCourseInput(base({ id: 7, status: "published" }), { isAdmin: false, stored: { ...stored, status: "draft" } });
    check("kilitli taslak (kayıtlı öğrencili) yayınlanabilir", r.ok && r.locked && r.input.status === "published");
  }
  {
    const r = parseCourseInput(base({ id: 7, status: "draft", type: "meeting", buttonType: "whatsapp", modules: [] }), { isAdmin: true, stored });
    check("yönetici kısıtlanmaz", r.ok && !r.locked && r.input.status === "draft" && r.input.type === "meeting" && r.input.buttonType === "whatsapp", r.ok ? "" : r.error);
  }
  {
    const r = parseCourseInput(base({ buttonType: "whatsapp" }), teacher);
    check("eğitmen yeni eğitimde satış düğmesini kaldıramaz", r.ok && r.input.buttonType === "cart");
    const free: CourseLockInfo = { status: "draft", type: "course", buttonType: "both", students: 0, teacherLocked: false };
    const u = parseCourseInput(base({ id: 7, type: "meeting", modules: [], buttonType: "cart" }), { isAdmin: false, stored: free });
    check("kilitsiz taslakta eğitmen türü değiştirebilir, düğme kayıttaki gibi kalır", u.ok && !u.locked && u.input.type === "meeting" && u.input.buttonType === "both");
  }

  // Ders süresi ve WhatsApp numarası
  const dur = (d: string) => base({ modules: [{ title: "M", lessons: [lesson({ duration: d })] }] });
  expectErr("süre \"abc\" reddedilir", dur("abc"), "Süre", "yalnızca rakam");
  expectErr("süre \"12:75\" reddedilir (saniye 59'u aşamaz)", dur("12:75"), "Süre");
  expectErr("süre \"1:2:3:4\" reddedilir", dur("1:2:3:4"), "Süre");
  for (const d of ["", "12", "2:5", "12:30", "1:05:00"]) check(`süre "${d}" kabul edilir`, err(dur(d)) === "", err(dur(d)));
  check("sınav dersinde süre alanı denetlenmez", err(base({ modules: [{ title: "M", lessons: [lesson({ type: "quiz", duration: "abc" })] }] })) === "");
  expectErr("WhatsApp numarası \"abc\" reddedilir", base({ whatsappNumber: "abc" }), "WhatsApp numarası", "geçerli bir telefon");
  expectErr("WhatsApp numarası çok kısa ise reddedilir", base({ whatsappNumber: "12345" }), "WhatsApp numarası");
  for (const n of ["", "905321234567", "+90 532 123 45 67", "0532 123 45 67", "5321234567"]) check(`WhatsApp numarası "${n}" kabul edilir`, err(base({ whatsappNumber: n })) === "", err(base({ whatsappNumber: n })));

  const typed: CourseInput | null = (() => { const r = parseCourseInput(base(), admin); return r.ok ? r.input : null; })();
  check("çıktı tipi okunur", !!typed && typed.price === 1000);

  console.log(failed ? `\n${failed} denetim BAŞARISIZ` : "\nTüm denetimler geçti");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
