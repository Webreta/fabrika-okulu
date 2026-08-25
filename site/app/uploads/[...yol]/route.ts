import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// Çalışma anında yüklenen dosyalar Next'in statik sunumuna girmez; bu rota diskten okur.
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ yol: string[] }> }
) {
  const { yol } = await params;
  const base = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(base, ...yol.map((p) => decodeURIComponent(p)));
  if (!filePath.startsWith(base + path.sep)) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const info = await stat(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    const range = request.headers.get("range");
    const data = await readFile(filePath);
    // Video için basit Range desteği (seek çalışsın)
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1]) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2]), info.size - 1) : info.size - 1;
      return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
        },
      });
    }
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
