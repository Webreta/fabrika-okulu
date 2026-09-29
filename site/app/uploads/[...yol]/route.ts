import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canReadPrivateUpload, isPrivateUpload, serveUpload, uploadSegments } from "@/lib/serve-file";

// Çalışma anında yüklenen dosyalar Next'in statik sunumuna girmez; bu rota diskten okur.
// Kişisel dosyalar (belge, özgeçmiş, görev, ses) oturum ve sahiplik denetiminden geçer;
// middleware.ts bu yolları /api/ozel-dosya'ya yönlendirir, buradaki denetim ikinci emniyettir.
export async function GET(request: Request, { params }: { params: Promise<{ yol: string[] }> }) {
  const yol = uploadSegments((await params).yol);
  if (!yol) return new NextResponse(null, { status: 404 });
  if (isPrivateUpload(yol)) {
    const user = await getCurrentUser();
    if (!canReadPrivateUpload(user, yol)) return new NextResponse(null, { status: user ? 403 : 401 });
    return serveUpload(request, yol, { private: true });
  }
  return serveUpload(request, yol, { private: false });
}
