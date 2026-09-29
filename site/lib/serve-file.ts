import "server-only";
import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/session";

// public/uploads altındaki dosyaların sunumu (çalışma anında yüklenenler Next'in statik sunumuna girmez).
// Öğrencinin yüklediği kişisel dosyalar (belge, özgeçmiş, görev, ses) yalnızca sahibine ve yetkili personele açılır.

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", svg: "image/svg+xml", gif: "image/gif", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm", m4v: "video/mp4", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain; charset=utf-8", zip: "application/zip",
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
};

/** Kişisel dosya klasörleri: /uploads/<tür>/<kullanıcı id>/<dosya>. middleware.ts içinde aynı liste var (edge'de bu modül yüklenemez). */
export const PRIVATE_UPLOAD_DIRS = ["belgeler", "ozgecmis", "gorev", "ses"];

/**
 * Adres parçalarını çözer ve doğrular. Denetim ile dosya okuma AYNI (çözülmüş) parçalar üzerinden yapılmalı:
 * "belgeler%2F3%2Fx.pdf" tek parça olarak gelir; çözülmeden bakılırsa "açık dosya" sanılır, okunurken ise
 * belgeler/3/x.pdf olur. İçinde ayraç, üst klasör ya da çözülemeyen kodlama kalan adres geçersizdir (null).
 */
export function uploadSegments(segments: string[]): string[] | null {
  const out: string[] = [];
  for (const raw of segments ?? []) {
    let s = raw;
    try {
      for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) s = decodeURIComponent(s);
    } catch {
      return null;
    }
    if (!s || s === "." || s === ".." || /[\/\\\0]/.test(s) || /%[0-9a-f]{2}/i.test(s)) return null;
    out.push(s);
  }
  return out.length ? out : null;
}

export function isPrivateUpload(segments: string[]) {
  return PRIVATE_UPLOAD_DIRS.includes((segments[0] ?? "").toLowerCase());
}

/**
 * Kişisel dosyayı kim görebilir:
 * - sahibi (yoldaki kullanıcı id'si oturumdaki kullanıcıysa)
 * - yönetici: hepsi
 * - eğitmen: görev dosyaları ve ses kayıtları (gönderim değerlendirme)
 * - süper eğitmen: ayrıca belgeler ve özgeçmişler (belge/kupon yönetimi)
 */
export function canReadPrivateUpload(user: SessionUser | null, segments: string[]) {
  if (!user) return false;
  const kind = (segments[0] ?? "").toLowerCase();
  const ownerId = Number(segments[1]);
  if (Number.isInteger(ownerId) && ownerId === user.id) return true;
  if (user.role === "admin") return true;
  if (user.role === "teacher") return kind === "gorev" || kind === "ses" || user.isSuperTeacher;
  return false;
}

/** segments: uploadSegments() ile çözülmüş parçalar */
export async function serveUpload(request: Request, segments: string[], opts: { private: boolean }) {
  const base = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(base, ...segments);
  if (!filePath.startsWith(base + path.sep)) return new NextResponse(null, { status: 404 });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    // Tarayıcı içerik türünü tahmin etmesin; dosya doğrudan açıldığında (ör. SVG) içindeki betik çalışmasın
    const common: Record<string, string> = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": opts.private ? "private, no-store" : "public, max-age=3600",
    };
    // PDF'te sandbox yok: tarayıcının PDF görüntüleyicisi sandbox altında çalışmaz (belge boş görünür);
    // PDF içinde sayfamızda betik çalıştırma riski de yoktur. Diğer türlerde (eski SVG yüklemeleri dahil) sandbox geçerli.
    if (type !== "application/pdf") common["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'";
    const data = await readFile(filePath);
    const range = request.headers.get("range");
    // Video/ses için basit Range desteği (seek çalışsın)
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1]) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers: { ...common, "Content-Range": `bytes ${start}-${end}/${info.size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new NextResponse(new Uint8Array(data), { headers: { ...common, "Content-Length": String(info.size) } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
