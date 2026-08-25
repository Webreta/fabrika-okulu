// Kurs iş kuralları — eski eklentideki fabo_* yardımcılarının TS karşılığı.
// Panel, player, hatırlatma cron'u ve raporlar AYNI hesabı kullanmalı.

import type { Lesson } from "@/db/schema";

/** "2:35" → 155 sn, "1:02:35" → h:m:s, "12" → 12 dakika */
export function durationSecs(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t) return 0;
  const parts = t.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function durationText(totalSecs: number): string {
  if (totalSecs <= 0) return "";
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  if (m > 0) return `${m} dk`;
  return `${totalSecs} sn`;
}

/** "2:35" → "02:35", "12" → "12:00", "1:02:35" korunur */
export function normalizeDuration(input: string): string {
  const t = (input || "").trim();
  if (!t) return "";
  const parts = t.split(":");
  if (parts.length === 1) return `${parts[0].padStart(2, "0")}:00`;
  if (parts.length === 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return parts.map((p, i) => (i === 0 ? p : p.padStart(2, "0"))).join(":");
}

export type VideoSource =
  | { type: "youtube"; id: string; embed: string }
  | { type: "vimeo"; id: string; embed: string }
  | { type: "file"; url: string }
  | { type: "none" };

export function parseVideo(url: string | null | undefined): VideoSource {
  const u = (url || "").trim();
  if (!u) return { type: "none" };
  const yt =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
  if (yt) {
    return {
      type: "youtube",
      id: yt[1],
      embed: `https://www.youtube.com/embed/${yt[1]}?enablejsapi=1&rel=0&modestbranding=1`,
    };
  }
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(u);
  if (vm) {
    return {
      type: "vimeo",
      id: vm[1],
      embed: `https://player.vimeo.com/video/${vm[1]}?title=0&byline=0&portrait=0`,
    };
  }
  return { type: "file", url: u };
}

/** Dosya dersleri ilerlemeye dahil değildir */
export function countsForProgress(l: Pick<Lesson, "type">) {
  return l.type !== "file";
}

export type LessonDoneMap = Set<number>; // tamamlanmış lesson id'leri (video/quiz/assign/file fark etmez)

export function computeProgress(lessons: Pick<Lesson, "id" | "type">[], done: LessonDoneMap) {
  const counted = lessons.filter(countsForProgress);
  const total = counted.length;
  const completed = counted.filter((l) => done.has(l.id)).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

/**
 * Sıralı kilit: ilk tamamlanmamış dersin indeksi (dosyalar sıralamada sayılır).
 * Öğrenci frontier'dan sonrakileri açamaz.
 */
export function computeFrontier(lessons: Pick<Lesson, "id" | "type">[], done: LessonDoneMap) {
  const idx = lessons.findIndex((l) => !done.has(l.id));
  return idx === -1 ? lessons.length : idx;
}

/**
 * Göreli son teslim tabanı:
 * - dönemli kurs → kayıtlı dönemin start_date (+ start_time)
 * - esnek kurs → enrollments.started_at (öğrencinin kursu ilk açtığı an); null = saat başlamadı
 * Saat yoksa "date-only" döner → son teslim o günün 23:59:59'unda biter.
 */
export type TaskBase = { date: Date; dateOnly: boolean } | null;

export function taskBase(opts: {
  periodStartDate?: string | null;
  periodStartTime?: string | null;
  startedAt?: Date | null;
}): TaskBase {
  if (opts.periodStartDate) {
    if (opts.periodStartTime) {
      const [h, m] = opts.periodStartTime.split(":").map((x) => parseInt(x, 10) || 0);
      const d = new Date(`${opts.periodStartDate}T00:00:00`);
      d.setHours(h, m, 0, 0);
      return { date: d, dateOnly: false };
    }
    return { date: new Date(`${opts.periodStartDate}T00:00:00`), dateOnly: true };
  }
  if (opts.startedAt) return { date: new Date(opts.startedAt), dateOnly: false };
  return null;
}

export function taskDue(base: TaskBase, extraDays: number | null | undefined): Date | null {
  if (!base || !extraDays || extraDays <= 0) return null;
  const d = new Date(base.date);
  d.setDate(d.getDate() + extraDays);
  if (base.dateOnly) d.setHours(23, 59, 59, 0);
  return d;
}

/** Mutlak tarih: saat verilmemişse günün sonu */
export function deadlineOf(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : new Date(d);
  if (isNaN(date.getTime())) return null;
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
    date.setHours(23, 59, 59, 0);
  }
  return date;
}

export function isOverdue(due: Date | null) {
  return !!due && due.getTime() < Date.now();
}

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Başlangıç",
  intermediate: "Orta",
  advanced: "İleri",
  all: "Tüm Seviyeler",
};

export const GROUP_LABELS = {
  takvimli: "Takvimli Programlar",
  esnek: "Esnek Programlar",
  ucretsiz: "Ücretsiz Kaynaklar",
} as const;

export const GROUP_SLUGS = {
  takvimli: "takvimli-programlar",
  esnek: "esnek-programlar",
  ucretsiz: "ucretsiz-kaynaklar",
} as const;

export function groupFromSlug(slug: string): keyof typeof GROUP_LABELS | null {
  const e = Object.entries(GROUP_SLUGS).find(([, s]) => s === slug);
  return e ? (e[0] as keyof typeof GROUP_LABELS) : null;
}

/** Aktif fiyat: indirim geçerliyse indirimli */
export function effectivePrice(c: {
  isFree: boolean;
  price: string | number;
  salePrice?: string | number | null;
  saleTo?: string | null;
}) {
  if (c.isFree) return 0;
  const price = Number(c.price) || 0;
  const sale = c.salePrice != null ? Number(c.salePrice) : 0;
  if (sale > 0 && sale < price) {
    if (c.saleTo) {
      const end = new Date(`${c.saleTo}T23:59:59`);
      if (end.getTime() < Date.now()) return price;
    }
    return sale;
  }
  return price;
}

export function hasActiveSale(c: {
  isFree: boolean;
  price: string | number;
  salePrice?: string | number | null;
  saleTo?: string | null;
}) {
  return !c.isFree && effectivePrice(c) < (Number(c.price) || 0);
}
