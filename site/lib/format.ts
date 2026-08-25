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

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export const ORDER_STATUS: Record<string, { label: string; color: "green" | "amber" | "red" | "gray" }> = {
  paid: { label: "Tamamlandı", color: "green" },
  pending: { label: "Ödeme bekliyor", color: "amber" },
  failed: { label: "Başarısız", color: "red" },
  cancelled: { label: "İptal", color: "gray" },
  refunded: { label: "İade", color: "gray" },
};
