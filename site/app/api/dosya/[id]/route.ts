import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { playerAccess } from "@/lib/player";

// Korumalı ders dosyaları private/korumali/ altında (public dışı). Yalnızca erişimi olan öğrenci/eğitmen görür.
const PRIVATE_DIR = path.join(process.cwd(), "private", "korumali");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [l] = await db.select().from(lessons).where(eq(lessons.id, Number(id))).limit(1);
  if (!l || l.type !== "file" || !l.fileUrl) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  const acc = await playerAccess(user, l.courseId);
  if (!acc.ok) return new NextResponse(null, { status: 403 });

  const full = path.join(PRIVATE_DIR, path.basename(l.fileUrl));
  try {
    const data = await readFile(full);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": l.fileMime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(l.fileName || "dosya")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
