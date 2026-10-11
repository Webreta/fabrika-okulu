// Öğrenci paneli görünüm temaları (kapak görseli + renk paleti). Kapaklar 3168×1344 (≈2,36:1) oranındadır ve panel banner'ı ile
// tema seçici bu oranda çizilir: görsel kırpılmaz (BANNER_ASPECT).
// Renk değişkenleri app/globals.css içindeki .fo-theme[data-theme=…] bloklarında tanımlıdır; yeni tema eklerken ikisi birlikte güncellenir.
/** Kapak görselinin konusu: Çalışma Odası banner'ındaki "Görsel hakkında" penceresinde gösterilir */
export type ThemeAbout = { title: string; text: string; link?: { label: string; href: string } };

export type PanelTheme = {
  key: string;
  /** Tema adı: kapak görselindeki yer (2026-10-11: eski "Klasik/Aydınlık…" adları `desc`'e taşındı) */
  label: string;
  desc: string;
  img: string | null;
  focus: string;
  vars: Record<string, string> | null;
  about: ThemeAbout;
};

export const PANEL_THEMES: PanelTheme[] = [
  { key: "yok", label: "Ağrı", desc: "Klasik palet · sade beyaz", img: "/img/banners/klasik.webp", focus: "center", vars: null, about: { title: "Ağrı Dağı", text: "Ağrı Dağı, 5137 m. Türkiye'nin en büyük buzulunu barındıran sönmüş bir stratovolkandır." } },
  {
    key: "aydinlik", label: "Erciyes", desc: "Aydınlık palet · ferah, açık tonlar", img: "/img/banners/aydinlik.webp", focus: "center 40%",
    vars: { card: "#ffffff", surface: "#f5f7fa", line: "#e3e8ef", ink: "#12233a", navy: "#194977", sky: "#5baecf" },
    about: { title: "Erciyes Dağı", text: "Erciyes, 3917 m. İç Anadolu'nun en yüksek dağı, Türkiye'nin en hacimli sönmüş stratovolkanı. Kapadokya peri bacalarının oluşmasını sağlayan ana kaynaklardan biri." },
  },
  {
    key: "lavanta", label: "Kadıralak", desc: "Lavanta palet · mor tonları", img: "/img/banners/lavanta.webp", focus: "center 50%",
    vars: { card: "#fdfbff", surface: "#f4effc", line: "#e4dcf3", ink: "#241a3a", navy: "#5b3d99", sky: "#a274d9" },
    about: { title: "Kadıralak Yaylası", text: "Trabzon Kadıralak Yaylası deniz seviyesinden 1300 m yükseklikte yer alır. Uluslararası koruma altındaki \"Mavi Yıldız\" çiçeklerinin nisan ayında açmasıyla \"Mor Yayla\"ya dönüşür." },
  },
  {
    key: "gunbatimi", label: "Göreme", desc: "Gün Batımı palet · sıcak tonlar", img: "/img/banners/gunbatimi.webp", focus: "center 50%",
    vars: { card: "#fffcf5", surface: "#fdf3e1", line: "#f0dfc0", ink: "#3a2410", navy: "#b8541a", sky: "#e9a23b" },
    about: { title: "Göreme", text: "Göreme, Kapadokya bölgesinin kalbinde yer alır. Peri bacaları, tüf kayalara oyulmuş kiliseleri ve muhteşem sıcak hava balonu manzaralarıyla ünlüdür. UNESCO Dünya Mirası listesindedir." },
  },
  {
    key: "okyanus", label: "Ilgaz", desc: "Okyanus palet · derin mavi-turkuaz", img: "/img/banners/okyanus.webp", focus: "center 50%",
    vars: { card: "#f7fcfd", surface: "#e9f5f8", line: "#cfe6ec", ink: "#0e2a3a", navy: "#0f4c6e", sky: "#1fa7a7" },
    about: { title: "Ilgaz Dağı", text: "Ilgaz Dağı (Büyük Hacet Tepesi, 2587 m) Çankırı ile Kastamonu il sınırında yer alır. \"Ilgaz, Anadolu'nun sen yüce bir dağısın.\"", link: { label: "Türküyü dinle", href: "https://youtu.be/7aKUxgY96ds" } },
  },
  {
    key: "kutuphane", label: "Yedigöller", desc: "Kütüphane palet · koyu orman yeşili", img: "/img/banners/kutuphane.webp", focus: "center 45%",
    vars: { card: "#fdfbf6", surface: "#f3efe6", line: "#e3ddcf", ink: "#1f2a1e", navy: "#2f4a3a", sky: "#7a9a4c" },
    about: { title: "Yedigöller Milli Parkı", text: "Bolu Yedigöller Milli Parkı; en büyüğü 24.895 m² olan Büyükgöl ve en derini 20 m olan Deringöl dahil yedi gölden oluşur. Pisagor Ağacı, Gülen Kayalar ve Dilek Çeşmesi görülebilir." },
  },
  {
    key: "kafe", label: "Üçüncü Adres", desc: "Kafe palet · koyu espresso", img: "/img/banners/kafe.webp", focus: "center 55%",
    vars: { card: "#fffaf3", surface: "#f7efe4", line: "#e8dccb", ink: "#2b1f14", navy: "#6b4423", sky: "#b8763a" },
    about: { title: "Üçüncü Adres", text: "The Third Place, yani \"Üçüncü Adres\": sosyolog Ray Oldenburg'un ev ve iş yerinden sonra en çok kullanılan sosyal yaşam alanlarına verdiği ad (1989, \"The Great Good Place\"). Zincir mağazaların yanı sıra artizan kahve dükkânları da rahat oturma yerleri, küçük büyük masalar, priz ve ücretsiz Wi-Fi sunarak işimize ya da dersimize çalışırken hepimize keyifli birer seçenek oluşturuyor." },
  },
  {
    key: "gece", label: "Boğaziçi", desc: "Gece palet · koyu lacivert", img: "/img/banners/gece.webp", focus: "center 50%",
    vars: { card: "#182233", surface: "#111827", line: "#273449", ink: "#e5e9f2", navy: "#9fc4ea", sky: "#5baecf" },
    about: { title: "Boğaziçi", text: "Karadeniz'i Marmara'ya bağlayan boğazın uzunluğu Anadolu yakasında 35 km, Avrupa yakasında 55 km'dir. En geniş yeri Rumeli Feneri ile Anadolu Feneri arası (yaklaşık 3600 m), en dar yeri Rumelihisarı ile Anadoluhisarı arasıdır (yaklaşık 700 m). Ortalama derinliği 60-65 m, en derin noktası Kandilli-Bebek arasıdır (110-120 m). Üzerinde üç asma köprü bulunur; tarihi yalılar, saraylar, camiler ve kaleler için Kabataş, Eminönü ya da Beşiktaş'tan kalkan teknelerle boğaz turu yapabilirsiniz." },
  },
  {
    key: "mor", label: "Asansör", desc: "Koyu Mor palet · gece moru", img: "/img/banners/mor.webp", focus: "center 50%",
    vars: { card: "#1e1733", surface: "#140f22", line: "#2f2547", ink: "#ece6f7", navy: "#c9b6f0", sky: "#a078e8" },
    about: { title: "İzmir Tarihi Asansör", text: "İzmir Tarihi Asansör, Karataş'ta 58 m'lik kot farkını 155 basamaklı dik merdivenle aşan Mithatpaşa Caddesi ile 305. Sokak arasında 1907'de inşa edilmiştir. İzmir'in en keyifli gün batımı manzaralarından birine sahiptir; alt girişindeki Dario Moreno Sokağı'nın tarihi dokusunda kafe ve restoranlarda keyifle zaman geçirebilirsiniz." },
  },
];

/** Kapak görsellerinin en-boy oranı (3168×1344 posterler, 2026-10-11); banner ve seçici kartı bu oranda, görsel kırpılmadan gösterilir */
export const BANNER_ASPECT = "3168 / 1344";

export function themeByKey(key: string | null | undefined, fallback = "aydinlik") {
  return PANEL_THEMES.find((t) => t.key === key) ?? PANEL_THEMES.find((t) => t.key === fallback) ?? PANEL_THEMES[0];
}

export function themeCss(t: PanelTheme) {
  if (!t.vars) return "";
  const v = t.vars;
  return `.fo-content{--t-card:${v.card};--t-surface:${v.surface};--t-line:${v.line};--t-ink:${v.ink};--t-navy:${v.navy};--t-sky:${v.sky}}`;
}
