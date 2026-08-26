import type { CertFields, CertRule } from "@/db/schema";

// Sertifika fontları — public/fonts/*.ttf (eklentiden taşındı)
export const CERT_FONTS: { key: string; label: string; file: string; group: string }[] = [
  { key: "cinzel", label: "Cinzel", file: "cinzel.ttf", group: "Başlık" },
  { key: "cinzeldec", label: "Cinzel Decorative", file: "cinzeldec.ttf", group: "Başlık" },
  { key: "marcellus", label: "Marcellus", file: "marcellus.ttf", group: "Başlık" },
  { key: "forum", label: "Forum", file: "forum.ttf", group: "Başlık" },
  { key: "bebas", label: "Bebas Neue", file: "bebas.ttf", group: "Başlık" },
  { key: "anton", label: "Anton", file: "anton.ttf", group: "Başlık" },
  { key: "oswald", label: "Oswald", file: "oswald.ttf", group: "Başlık" },
  { key: "playfair", label: "Playfair Display", file: "playfair.ttf", group: "Serif" },
  { key: "cormorant", label: "Cormorant Garamond", file: "cormorant.ttf", group: "Serif" },
  { key: "ebgaramond", label: "EB Garamond", file: "ebgaramond.ttf", group: "Serif" },
  { key: "lora", label: "Lora", file: "lora.ttf", group: "Serif" },
  { key: "merriweather", label: "Merriweather", file: "merriweather.ttf", group: "Serif" },
  { key: "montserrat", label: "Montserrat", file: "montserrat.ttf", group: "Sans" },
  { key: "poppins", label: "Poppins", file: "poppins.ttf", group: "Sans" },
  { key: "raleway", label: "Raleway", file: "raleway.ttf", group: "Sans" },
  { key: "josefin", label: "Josefin Sans", file: "josefin.ttf", group: "Sans" },
  { key: "greatvibes", label: "Great Vibes", file: "GreatVibes-Regular.ttf", group: "El yazısı" },
  { key: "dancing", label: "Dancing Script", file: "dancing.ttf", group: "El yazısı" },
  { key: "pinyon", label: "Pinyon Script", file: "pinyon.ttf", group: "El yazısı" },
  { key: "parisienne", label: "Parisienne", file: "parisienne.ttf", group: "El yazısı" },
  { key: "alexbrush", label: "Alex Brush", file: "alexbrush.ttf", group: "El yazısı" },
  { key: "allura", label: "Allura", file: "allura.ttf", group: "El yazısı" },
  { key: "italianno", label: "Italianno", file: "italianno.ttf", group: "El yazısı" },
  { key: "sacramento", label: "Sacramento", file: "sacramento.ttf", group: "El yazısı" },
  { key: "tangerine", label: "Tangerine", file: "tangerine.ttf", group: "El yazısı" },
];

export function fontFaceCss() {
  return CERT_FONTS.map((f) => `@font-face{font-family:"cert-${f.key}";src:url("/fonts/${f.file}") format("truetype");font-display:block}`).join("\n");
}

export const DEFAULT_CERT_FIELDS: CertFields = {
  name: { x: 50, y: 50, size: 32, color: "#194977", align: "center", weight: "700", font: "playfair", caps: false, spacing: 0 },
  course: { x: 50, y: 65, size: 22, color: "#194977", align: "center", weight: "600", font: "montserrat", caps: false, spacing: 0 },
  date: { enabled: true, x: 50, y: 75, size: 14, color: "#5f6b80", align: "center", weight: "400", font: "montserrat", caps: false, spacing: 0 },
  qr: { enabled: false, x: 88, y: 82, size: 120 },
};

export const DEFAULT_CERT_RULE: CertRule = { scope: "all", courseId: 0, condition: "completed", auto: false };

/** Görünür seri numarası — FO-<yıl>-<6 haneli id> (token'dan bağımsız, insan okunur) */
export function certSerial(id: number, issuedAt: Date | string) {
  const y = new Date(issuedAt).getFullYear();
  return `FO-${y}-${String(id).padStart(6, "0")}`;
}

export const CERT_CONDITIONS = {
  enrolled: "Kayıt olunca",
  started: "Kursu başlatınca",
  completed: "Kursu bitirince",
} as const;

export function trUpper(s: string) {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toLocaleUpperCase("tr-TR");
}
