/** Özgeçmişim dosya türleri — istemci ve sunucu ortak */
export type ResumeKind = "cv" | "belge";

export const RESUME_QUOTA_BYTES = 50 * 1024 * 1024; // her tür için ayrı 50 MB
export const RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"]);

export const RESUME_KINDS: { key: ResumeKind; title: string; hint: string }[] = [
  { key: "cv", title: "CV", hint: "PDF, Word ya da görsel · toplam 50 MB" },
  { key: "belge", title: "Sertifika / Başarı / Katılım belgeleri", hint: "PDF, Word ya da görsel · toplam 50 MB" },
];

export function isResumeKind(v: unknown): v is ResumeKind {
  return v === "cv" || v === "belge";
}

export function fmtBytes(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
