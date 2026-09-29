// Kurs editörü sınırları: sunucudaki doğrulama (lib/course-save.ts) ve editördeki maxLength değerleri aynı kaynağı kullanır.
// İstemci bileşenlerinden de içe aktarılabilir (sunucuya özel kod içermez).

/** Uzunluk ve değer sınırları */
export const COURSE_LIMITS = {
  title: 150, shortDescription: 300, description: 50000, moduleTitle: 150, lessonTitle: 200, lessonDescription: 20000,
  periodName: 100, periodDescription: 500, sessionTitle: 150, url: 500, questionText: 2000, optionText: 500, explanation: 2000,
  outcome: 300, outcomeCount: 30, target: 5000, note: 300, maxPrice: 1000000, maxCapacity: 10000,
} as const;

/** Görev var ama dönem yok hatası (editördeki uyarı da aynı yönlendirmeyi yapar) */
export const ASSIGN_NEEDS_PERIOD = "görev yalnızca dönemli (takvimli) eğitimde olabilir. Önce sayfanın altındaki “Dönemler” bölümünden bir dönem ekle ya da bu görevi sil";
