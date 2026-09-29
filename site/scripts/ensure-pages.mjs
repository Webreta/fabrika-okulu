// Canlıda bulunması gereken temel içerik: yasal sayfalar (KVKK, mesafeli satış sözleşmesi, iade şartları…).
// Ödeme ve kayıt formları bu sayfalara bağlantı verir. Yalnızca EKSİK olan sayfa eklenir; var olan sayfanın
// (yöneticinin düzenlediği) içeriğine dokunulmaz. scripts/start.sh her açılışta çağırır. Örnek veri üretmez.
import "dotenv/config";
import { readFileSync } from "fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ensure-pages: DATABASE_URL tanımlı değil; atlandı.");
  process.exit(0);
}
let legal;
try {
  legal = JSON.parse(readFileSync(new URL("../db/seed-data/legal.json", import.meta.url), "utf-8"));
} catch (e) {
  console.error("ensure-pages: db/seed-data/legal.json okunamadı; atlandı.", e?.message ?? e);
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  let added = 0;
  for (const [slug, p] of Object.entries(legal)) {
    const r = await sql`insert into pages (slug, title, html) values (${slug}, ${p.title}, ${p.html}) on conflict (slug) do nothing returning id`;
    added += r.length;
  }
  if (added) console.log(`ensure-pages: ${added} yasal sayfa eklendi.`);
} catch (e) {
  console.error("ensure-pages: hata:", e?.message ?? e);
} finally {
  await sql.end();
}
