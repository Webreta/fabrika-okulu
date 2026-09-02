// Öğrenci paneli görünüm temaları (banner + renk paleti). Yalnızca .content içinde uygulanır.
export type PanelTheme = {
  key: string;
  label: string;
  desc: string;
  img: string | null;
  focus: string;
  vars: Record<string, string> | null;
};

export const PANEL_THEMES: PanelTheme[] = [
  { key: "yok", label: "Klasik", desc: "Sade beyaz görünüm", img: null, focus: "center", vars: null },
  {
    key: "aydinlik", label: "Aydınlık", desc: "Ferah, açık tonlar", img: "/img/banners/aydinlik.jpg", focus: "center 40%",
    vars: { card: "#ffffff", surface: "#f5f7fa", line: "#e3e8ef", ink: "#12233a", navy: "#194977", sky: "#5baecf" },
  },
  {
    key: "lavanta", label: "Lavanta", desc: "Mor tonları, sakin", img: "/img/banners/lavanta.jpg", focus: "center 50%",
    vars: { card: "#fdfbff", surface: "#f4effc", line: "#e4dcf3", ink: "#241a3a", navy: "#5b3d99", sky: "#a274d9" },
  },
  {
    key: "gunbatimi", label: "Gün Batımı", desc: "Sarı-turuncu, sıcak", img: "/img/banners/gunbatimi.jpg", focus: "center 50%",
    vars: { card: "#fffcf5", surface: "#fdf3e1", line: "#f0dfc0", ink: "#3a2410", navy: "#b8541a", sky: "#e9a23b" },
  },
  {
    key: "okyanus", label: "Okyanus", desc: "Derin mavi-turkuaz", img: "/img/banners/okyanus.jpg", focus: "center 50%",
    vars: { card: "#f7fcfd", surface: "#e9f5f8", line: "#cfe6ec", ink: "#0e2a3a", navy: "#0f4c6e", sky: "#1fa7a7" },
  },
  {
    key: "kutuphane", label: "Kütüphane", desc: "Koyu orman yeşili, odaklı", img: "/img/banners/kutuphane.jpg", focus: "center 45%",
    vars: { card: "#fdfbf6", surface: "#f3efe6", line: "#e3ddcf", ink: "#1f2a1e", navy: "#2f4a3a", sky: "#7a9a4c" },
  },
  {
    key: "kafe", label: "Kafe", desc: "Koyu espresso, karamel vurgu", img: "/img/banners/kafe.jpg", focus: "center 55%",
    vars: { card: "#fffaf3", surface: "#f7efe4", line: "#e8dccb", ink: "#2b1f14", navy: "#6b4423", sky: "#b8763a" },
  },
  {
    key: "gece", label: "Gece", desc: "Koyu lacivert, göz yormayan", img: "/img/banners/gece.jpg", focus: "center 50%",
    vars: { card: "#182233", surface: "#111827", line: "#273449", ink: "#e5e9f2", navy: "#9fc4ea", sky: "#5baecf" },
  },
];

export function themeByKey(key: string | null | undefined, fallback = "aydinlik") {
  return PANEL_THEMES.find((t) => t.key === key) ?? PANEL_THEMES.find((t) => t.key === fallback) ?? PANEL_THEMES[0];
}

export function themeCss(t: PanelTheme) {
  if (!t.vars) return "";
  const v = t.vars;
  return `.fo-content{--t-card:${v.card};--t-surface:${v.surface};--t-line:${v.line};--t-ink:${v.ink};--t-navy:${v.navy};--t-sky:${v.sky}}`;
}
