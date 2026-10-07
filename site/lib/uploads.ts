import "server-only";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

// Yüklenen tüm dosyalar public/uploads/<subdir> altına yazılır; canlıda tek volume yeter.

export const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "rtf",
  "odt", "ods", "png", "jpg", "jpeg", "webp", "zip", "rar",
]);
// SVG yok: içinde betik taşıyabilir ve site adresinden sunulur
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "m4v", "mov"]);
export const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg"]);
export const FONT_EXTENSIONS = new Set(["ttf", "otf", "woff", "woff2"]);
export const ANY_EXTENSIONS = new Set([
  ...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS,
]);

export function slugify(text: string, max = 80) {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  return text
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/**
 * Diske yazma hatasını kullanıcıya gösterilecek Türkçe iletiye çevirir; gerçek hata sunucu kaydına yazılır.
 * Canlıda en sık neden: volume kök (root) sahipliğiyle bağlanmış, uygulama "nextjs" kullanıcısıyla yazamıyor
 * (scripts/start.sh açılışta sahipliği düzeltir; Sistem sağlığı sekmesi de bunu denetler).
 */
export function diskWriteError(e: unknown, dir: string): string {
  const code = (e as NodeJS.ErrnoException)?.code;
  console.error(`[yükleme] diske yazılamadı (${dir}):`, e);
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return "Dosya sunucuya kaydedilemedi: yükleme klasörüne yazma izni yok. Yönetim → Ayarlar → Sistem sağlığı sekmesine bak.";
  }
  if (code === "ENOSPC") return "Dosya sunucuya kaydedilemedi: sunucuda boş disk alanı kalmadı.";
  return "Dosya sunucuya kaydedilemedi. Lütfen tekrar dene; sorun sürerse yöneticiye bildir.";
}

export type UploadResult =
  | { ok: true; publicPath: string | null; name?: string; size?: number; mime?: string }
  | { ok: false; error: string };

// Dosya seçilmediyse { publicPath: null } döner
export async function saveUploadedFile(
  value: FormDataEntryValue | null,
  subdir: string,
  allowed: Set<string>,
  maxBytes = 50 * 1024 * 1024
): Promise<UploadResult> {
  if (!(value instanceof File) || value.size === 0 || !value.name) {
    return { ok: true, publicPath: null };
  }
  const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.has(ext)) {
    return { ok: false, error: `Desteklenmeyen dosya türü (.${ext}).` };
  }
  if (value.size > maxBytes) {
    return { ok: false, error: `Dosya ${Math.round(maxBytes / 1024 / 1024)} MB'den büyük olamaz.` };
  }
  const safeSub = subdir.replace(/[^a-z0-9/_-]/gi, "");
  const dir = path.join(process.cwd(), "public", "uploads", safeSub);
  const base = slugify(value.name.replace(/\.[^.]+$/, ""), 60) || "dosya";
  const fileName = `${base}-${Date.now().toString(36)}.${ext}`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), Buffer.from(await value.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: diskWriteError(e, dir) };
  }
  return {
    ok: true,
    publicPath: `/uploads/${safeSub}/${fileName}`,
    name: value.name,
    size: value.size,
    mime: value.type,
  };
}

export async function removeUploadedFile(publicPath: string | null | undefined) {
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const base = path.join(process.cwd(), "public", "uploads");
  const full = path.join(process.cwd(), "public", publicPath);
  if (!full.startsWith(base)) return;
  try {
    await unlink(full);
  } catch {
    // zaten yoksa sorun değil
  }
}
