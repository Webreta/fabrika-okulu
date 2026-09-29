// Tarih / para biçimlendirme (Türkçe)

const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function toDate(d: Date | string | number | null | undefined): Date | null {
  if (d == null || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

export function fmtDate(d: Date | string | null | undefined, long = false) {
  const date = toDate(d);
  if (!date) return "";
  const m = long ? MONTHS_LONG[date.getMonth()] : MONTHS_SHORT[date.getMonth()];
  return `${date.getDate()} ${m} ${date.getFullYear()}`;
}

export function fmtDateTime(d: Date | string | null | undefined) {
  const date = toDate(d);
  if (!date) return "";
  return `${fmtDate(date)} · ${fmtTime(date)}`;
}

export function fmtTime(d: Date | string | null | undefined) {
  const date = toDate(d);
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → "7 Eyl 2026" */
export function fmtDay(s: string | null | undefined, long = false) {
  if (!s) return "";
  return fmtDate(new Date(`${s}T00:00:00`), long);
}

/** "07 Eyl - 13 Eyl 2026" */
export function fmtRange(a: string, b: string) {
  const da = new Date(`${a}T00:00:00`);
  const dbb = new Date(`${b}T00:00:00`);
  if (isNaN(da.getTime()) || isNaN(dbb.getTime())) return "";
  const left = `${String(da.getDate()).padStart(2, "0")} ${MONTHS_SHORT[da.getMonth()]}`;
  const right = `${String(dbb.getDate()).padStart(2, "0")} ${MONTHS_SHORT[dbb.getMonth()]} ${dbb.getFullYear()}`;
  return `${left} - ${right}`;
}

export function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(v);
}

export function relTime(d: Date | string | null | undefined) {
  const date = toDate(d);
  if (!date) return "";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 172800) return "dün";
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} gün önce`;
  return fmtDate(date);
}

/** WhatsApp için numaranın rakamları: "+90 532…", "0090 532…", "0 532…", "532…" → "90532…" */
export function waDigits(phone: string) {
  let d = (phone || "").replace(/\D/g, "").replace(/^00/, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "90" + d;
  return d;
}

/** WhatsApp numarası geçerli mi: yalnızca rakam, boşluk ve + ( ) - içerir; düzenlenince 10–15 hane olur */
export function isWaNumber(phone: string) {
  const t = (phone || "").trim();
  if (!/^[\d\s+()-]+$/.test(t)) return false;
  const d = waDigits(t);
  return d.length >= 10 && d.length <= 15;
}

/** Telefon numarasından WhatsApp bağlantısı: "+90 532…", "0090 532…", "0 532…", "532…" → https://wa.me/90532… */
export function waLink(phone: string) {
  return `https://wa.me/${waDigits(phone)}`;
}

/** Tarihin YEREL günü "YYYY-MM-DD" (toISOString UTC gününü verir; gece 00:00–03:00 arasında bir gün geride kalır) */
export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" gününe gün ekler/çıkarır (saat diliminden bağımsız) */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  return isoDay(new Date());
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
}

export function excerpt(text: string, max = 120) {
  const t = (text || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

/**
 * Sayıya gelen iyelik/belirtme eki: 1'i, 2'si, 3'ü, 4'ü, 5'i, 6'sı, 7'si, 8'i, 9'u, 10'u, 20'si, 30'u, 40'ı, 50'si,
 * 60'ı, 70'i, 80'i, 90'ı, 100'ü, 1000'i … Ek, sayının okunuşundaki son sözcüğe göre seçilir ("3 eğitimden 2'si").
 */
export function numSuffix(n: number) {
  const v = Math.abs(Math.trunc(Number(n) || 0));
  const ONES = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
  const TENS = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"];
  let suffix: string;
  if (v === 0) suffix = "ı"; // sıfırı
  else if (v % 10 !== 0) suffix = ONES[v % 10];
  else if (v % 100 !== 0) suffix = TENS[(v / 10) % 10];
  else if (v % 1000 !== 0) suffix = "ü"; // yüzü
  else if (v % 1_000_000 !== 0) suffix = "i"; // bini
  else if (v % 1_000_000_000 !== 0) suffix = "u"; // milyonu
  else suffix = "ı"; // milyarı
  return `${n}'${suffix}`;
}

/** Sunucu işlevine gelen kimlik geçerli mi? (pozitif tam sayı; elle oynanmış istekte "abc", 1.5, NaN, null gelebilir) */
export function isId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2_147_483_647;
}

/** Gündem kayıt türleri (Çalışma Odam "Yaklaşan" kutusu ve Gündemim aynı etiketleri kullanır) */
export const CALENDAR_TYPES: Record<"session" | "assignment" | "quiz" | "meeting" | "opening", { label: string; color: "purple" | "sky" | "amber"; action: string }> = {
  session: { label: "Canlı ders", color: "purple", action: "Katıl" },
  meeting: { label: "Görüşme", color: "purple", action: "Görüşmeye git" },
  opening: { label: "Açılış", color: "purple", action: "Kitaplığım" },
  quiz: { label: "Sınav", color: "sky", action: "Git" },
  assignment: { label: "Görev", color: "amber", action: "Git" },
};

export const ORDER_STATUS: Record<string, { label: string; color: "green" | "amber" | "red" | "gray" }> = {
  paid: { label: "Tamamlandı", color: "green" },
  pending: { label: "Ödeme bekliyor", color: "amber" },
  failed: { label: "Başarısız", color: "red" },
  cancelled: { label: "İptal", color: "gray" },
  refunded: { label: "İade", color: "gray" },
};
