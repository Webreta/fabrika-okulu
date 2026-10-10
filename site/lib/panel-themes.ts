// Öğrenci paneli görünüm temaları (kapak görseli + renk paleti). Kapaklar 1986×792 (≈2,5:1) oranındadır ve panel banner'ı ile
// tema seçici bu oranda çizilir: görsel kırpılmaz (BANNER_ASPECT).
// Renk değişkenleri app/globals.css içindeki .fo-theme[data-theme=…] bloklarında tanımlıdır; yeni tema eklerken ikisi birlikte güncellenir.
export type PanelTheme = {
  key: string;
  label: string;
  desc: string;
  img: string | null;
  focus: string;
  vars: Record<string, string> | null;
};

export const PANEL_THEMES: PanelTheme[] = [
  { key: "yok", label: "Klasik", desc: "Sade beyaz görünüm", img: "/img/banners/klasik.webp", focus: "center", vars: null },
  {
    key: "aydinlik", label: "Aydınlık", desc: "Ferah, açık tonlar", img: "/img/banners/aydinlik.webp", focus: "center 40%",
    vars: { card: "#ffffff", surface: "#f5f7fa", line: "#e3e8ef", ink: "#12233a", navy: "#194977", sky: "#5baecf" },
  },
  {
    key: "lavanta", label: "Lavanta", desc: "Mor tonları, sakin", img: "/img/banners/lavanta.webp", focus: "center 50%",
    vars: { card: "#fdfbff", surface: "#f4effc", line: "#e4dcf3", ink: "#241a3a", navy: "#5b3d99", sky: "#a274d9" },
  },
  {
    key: "gunbatimi", label: "Gün Batımı", desc: "Sarı-turuncu, sıcak", img: "/img/banners/gunbatimi.webp", focus: "center 50%",
    vars: { card: "#fffcf5", surface: "#fdf3e1", line: "#f0dfc0", ink: "#3a2410", navy: "#b8541a", sky: "#e9a23b" },
  },
  {
    key: "okyanus", label: "Okyanus", desc: "Derin mavi-turkuaz", img: "/img/banners/okyanus.webp", focus: "center 50%",
    vars: { card: "#f7fcfd", surface: "#e9f5f8", line: "#cfe6ec", ink: "#0e2a3a", navy: "#0f4c6e", sky: "#1fa7a7" },
  },
  {
    key: "kutuphane", label: "Kütüphane", desc: "Koyu orman yeşili, odaklı", img: "/img/banners/kutuphane.webp", focus: "center 45%",
    vars: { card: "#fdfbf6", surface: "#f3efe6", line: "#e3ddcf", ink: "#1f2a1e", navy: "#2f4a3a", sky: "#7a9a4c" },
  },
  {
    key: "kafe", label: "Kafe", desc: "Koyu espresso, karamel vurgu", img: "/img/banners/kafe.webp", focus: "center 55%",
    vars: { card: "#fffaf3", surface: "#f7efe4", line: "#e8dccb", ink: "#2b1f14", navy: "#6b4423", sky: "#b8763a" },
  },
  {
    key: "gece", label: "Gece", desc: "Koyu lacivert, göz yormayan", img: "/img/banners/gece.webp", focus: "center 50%",
    vars: { card: "#182233", surface: "#111827", line: "#273449", ink: "#e5e9f2", navy: "#9fc4ea", sky: "#5baecf" },
  },
  {
    key: "mor", label: "Koyu Mor", desc: "Gece moru, lila vurgu", img: "/img/banners/mor.webp", focus: "center 50%",
    vars: { card: "#1e1733", surface: "#140f22", line: "#2f2547", ink: "#ece6f7", navy: "#c9b6f0", sky: "#a078e8" },
  },
];

/** Kapak görsellerinin en-boy oranı (1986×792); banner ve seçici kartı bu oranda, görsel kırpılmadan gösterilir */
export const BANNER_ASPECT = "1986 / 792";

export function themeByKey(key: string | null | undefined, fallback = "aydinlik") {
  return PANEL_THEMES.find((t) => t.key === key) ?? PANEL_THEMES.find((t) => t.key === fallback) ?? PANEL_THEMES[0];
}

export function themeCss(t: PanelTheme) {
  if (!t.vars) return "";
  const v = t.vars;
  return `.fo-content{--t-card:${v.card};--t-surface:${v.surface};--t-line:${v.line};--t-ink:${v.ink};--t-navy:${v.navy};--t-sky:${v.sky}}`;
}
