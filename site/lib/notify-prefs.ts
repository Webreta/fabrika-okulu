/**
 * Bildirim tercihleri — istemci ve sunucu ortak.
 * Her bildirim `tag` önekine göre bir kategoriye düşer; kullanıcı kategoriyi kapattıysa
 * ne uygulama içi kayıt ne push gönderilir. Kategorisi olmayan (öneksiz) bildirimler her zaman gider.
 */

export type NotifyPrefs = Record<string, boolean>; // "kategori" (panel/push) ve "mail:kategori" (e-posta) -> açık mı; yoksa açık sayılır

export const NOTIFY_CATEGORIES: { key: string; label: string; desc: string; prefixes: string[]; mailTypes: string[] }[] = [
  { key: "gorev", label: "Görev & sınav", desc: "Yeni görev/sınav atandığında ve teslim tarihi yaklaşınca", prefixes: ["asg-", "qz-", "due-", "grade-"], mailTypes: ["new_assignment", "new_quiz", "due_reminder", "assignment_graded"] },
  { key: "oturum", label: "Canlı oturum & takvim", desc: "Oturum başlamadan önce hatırlatma, program değişiklikleri", prefixes: ["sess-", "ev-", "period-"], mailTypes: ["event_reminder"] },
  { key: "soru", label: "Soru-cevap", desc: "Eğitmenin sorunu yanıtlaması", prefixes: ["qa-"], mailTypes: ["question_answered"] },
  { key: "program", label: "Program & sertifika", desc: "Kayıt tamamlandığında ve sertifikan hazır olduğunda", prefixes: ["enroll-", "cert-"], mailTypes: ["certificate"] },
  { key: "kupon", label: "Belge & kupon", desc: "Yüklediğin belge onaylanıp kupon tanımlandığında", prefixes: ["coupon-"], mailTypes: ["coupon"] },
  { key: "duyuru", label: "Duyurular", desc: "Fabrika Okulu ekibinden genel duyurular", prefixes: ["ann-"], mailTypes: ["announcement"] },
  { key: "anket", label: "Anketler", desc: "Yeni anket yayınlandığında", prefixes: ["survey-"], mailTypes: ["survey"] },
];

export function categoryOfTag(tag: string | undefined) {
  if (!tag) return null;
  return NOTIFY_CATEGORIES.find((c) => c.prefixes.some((p) => tag.startsWith(p))) ?? null;
}

export function categoryOfMailType(type: string | undefined) {
  if (!type) return null;
  return NOTIFY_CATEGORIES.find((c) => c.mailTypes.includes(type)) ?? null;
}

/** Kullanıcı bu türdeki bildirim e-postasını almak istiyor mu? Kategorisiz türler (işlemsel vb.) her zaman gider. */
export function wantsEmail(prefs: NotifyPrefs | null | undefined, type: string | undefined) {
  const cat = categoryOfMailType(type);
  if (!cat) return true;
  return prefs?.[`mail:${cat.key}`] !== false;
}

/** Kullanıcı bu etiketli bildirimi almak istiyor mu? Tercih kaydı yoksa açık. */
export function wantsNotification(prefs: NotifyPrefs | null | undefined, tag: string | undefined) {
  const cat = categoryOfTag(tag);
  if (!cat) return true;
  return prefs?.[cat.key] !== false;
}
