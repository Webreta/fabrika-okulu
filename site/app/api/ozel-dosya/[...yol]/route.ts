import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canReadPrivateUpload, isPrivateUpload, serveUpload, uploadSegments } from "@/lib/serve-file";

// Öğrencinin yüklediği kişisel dosyalar (belge, özgeçmiş, görev, ses): /uploads/<tür>/<kullanıcı id>/<dosya>
// middleware.ts bu adresleri buraya yönlendirir; böylece sunucu açılışında diskte duran eski dosyalar da
// Next'in statik sunumundan değil, oturum ve sahiplik denetiminden geçerek verilir.
export async function GET(request: Request, { params }: { params: Promise<{ yol: string[] }> }) {
  const yol = uploadSegments((await params).yol);
  if (!yol || !isPrivateUpload(yol)) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!canReadPrivateUpload(user, yol)) return new NextResponse(null, { status: user ? 403 : 401 });
  return serveUpload(request, yol, { private: true });
}
