/**
 * Online görüşme ürünleri (courses.type = "meeting") — istemci ve sunucu ortak yardımcılar.
 * Model: her "koltuk" bir dönemdir (periods): kapasite + oturum programı (schedule).
 * Tek görüşmede schedule 1 kayıt, 3 haftalık danışmanlıkta 3 kayıt (haftada bir) içerir.
 */
import type { ScheduleItem } from "@/db/schema";

export type MeetingSession = {
  index: number;
  date: string;
  time: string;
  start: Date;
  end: Date;
  link: string;
  title: string;
  attended: boolean;
};

export const JOIN_EARLY_MIN = 15; // görüşme bağlantısı başlangıçtan bu kadar önce açılır

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function addMinutes(hhmm: string, min: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Sal 8 Eyl" */
export function fmtDayShort(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sal 8 Eyl · 18:00-18:15" */
export function fmtSlot(date: string, time: string, minutes: number) {
  return `${fmtDayShort(date)} · ${time}${minutes > 0 ? `-${addMinutes(time, minutes)}` : ""}`;
}

export function meetingSessions(schedule: ScheduleItem[], minutes: number, attended: Iterable<number>, fallbackLink = ""): MeetingSession[] {
  const done = new Set(attended);
  return (schedule ?? [])
    .map((s, index) => {
      const time = s.time || "00:00";
      const start = new Date(`${s.date}T${time}:00`);
      const end = new Date(start.getTime() + Math.max(minutes, 0) * 60000);
      return { index, date: s.date, time, start, end, link: s.link || fallbackLink, title: s.title || `${index + 1}. görüşme`, attended: done.has(index) };
    })
    .filter((s) => s.date)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Sıradaki (katılım işaretlenmemiş) görüşme */
export function nextSession(sessions: MeetingSession[]) {
  return sessions.find((s) => !s.attended) ?? null;
}

export function canJoin(s: Pick<MeetingSession, "start" | "end">, now = new Date()) {
  return now.getTime() >= s.start.getTime() - JOIN_EARLY_MIN * 60000 && now.getTime() <= s.end.getTime();
}

/** "Katıldım" yalnızca görüşme saati geçince işaretlenebilir */
export function canMarkAttended(s: Pick<MeetingSession, "start" | "end">, now = new Date()) {
  return now.getTime() >= s.end.getTime();
}

export type SlotInput = {
  name: string;
  startDate: string;
  startTime: string;
  endDate: string;
  capacity: number;
  description: string;
  schedule: { date: string; time: string; title: string; link: string; notes: string }[];
};

/**
 * Koltuk üretici: verilen günlerde başlangıç-bitiş arasını `minutes` uzunluğunda (+`gap` ara) dilimler.
 * weeks > 1 ise her koltuk aynı gün/saatte haftalık tekrar eden `weeks` oturum içerir (örn. 3 haftalık danışmanlık).
 */
export function generateSlots(o: { dates: string[]; startTime: string; endTime: string; minutes: number; gap: number; weeks: number; capacity: number; link: string }): SlotInput[] {
  const out: SlotInput[] = [];
  const minutes = Math.max(5, o.minutes);
  const weeks = Math.max(1, o.weeks);
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  for (const date of o.dates.filter(Boolean).sort()) {
    for (let t = toMin(o.startTime); t + minutes <= toMin(o.endTime); t += minutes + Math.max(0, o.gap)) {
      const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      const schedule = Array.from({ length: weeks }, (_, k) => ({ date: addDays(date, 7 * k), time, title: weeks > 1 ? `${k + 1}. görüşme` : "Görüşme", link: o.link, notes: "" }));
      out.push({
        name: `${fmtSlot(date, time, minutes)}${weeks > 1 ? ` · ${weeks} hafta` : ""}`,
        startDate: date,
        startTime: time,
        endDate: schedule[schedule.length - 1].date,
        capacity: Math.max(1, o.capacity),
        description: "",
        schedule,
      });
    }
  }
  return out;
}
