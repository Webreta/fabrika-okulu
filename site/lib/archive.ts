import "server-only";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { archiveItems, users } from "@/db/schema";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";

/**
 * Genel arşiv (çöp kutusu). Yönetim panelinde silinen önemli kayıtlar kalıcı silinmeden önce buraya düşer:
 * silinen satırların tam kopyası `archive_items.payload` içinde saklanır, kayıt Yönetim → Arşiv'den geri alınır ya da
 * kalıcı silinir. Otomatik temizlik yoktur.
 *
 * Kopya veritabanının kendi bağlarından çıkarılır: silinen satıra `ON DELETE CASCADE` ile bağlı satırlar (ör. rota →
 * adımları, kullanıcı → kayıtları/ilerlemesi) kendiliğinden kopyaya girer; `SET NULL` bağları da not edilir ve geri
 * alırken yeniden bağlanır. Bağı veritabanında tanımlı olmayan ilişkiler (anket cevapları `survey_key` ile bağlıdır)
 * çağıran tarafından ayrı hedef olarak verilir.
 *
 * Eğitimler bu tabloyu kullanmaz: onların arşivi `courses.status = "archived"` iledir (içerik yerinde kalır).
 */

export const ARCHIVE_KINDS = {
  survey: "Anket",
  survey_reset: "Anket cevapları",
  user: "Kullanıcı",
  coupon: "Kupon",
  category: "Kategori",
  route: "Rota",
  cert_template: "Sertifika tasarımı",
  certificate: "Verilen sertifika",
  page: "Sayfa",
  instructor: "Eğitmen profili",
} as const;
export type ArchiveKind = keyof typeof ARCHIVE_KINDS;

type Row = Record<string, unknown>;
type Part = { table: string; rows: Row[] };
type Nulled = { table: string; column: string; id: number; value: unknown };
export type ArchivePayload = { parts: Part[]; nulled: Nulled[] };

/** Kopyaya girmeyen bağlı tablolar: oturum ve tek kullanımlık kayıtlar geri getirilmez */
const SKIP = new Set(["sessions", "password_resets", "push_subscriptions", "archive_items"]);
const MAX_ROWS = 50_000;
const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Geçersiz tablo/sütun adı: ${name}`);
  return sql.raw(`"${name}"`);
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rowsOf = <T>(r: unknown) => r as unknown as T[];

type Fk = { child: string; child_col: string; parent_col: string; del: string };
async function fksTo(tx: Tx, table: string): Promise<Fk[]> {
  return rowsOf<Fk>(await tx.execute(sql`
    select cc.relname as child, a.attname as child_col, af.attname as parent_col, c.confdeltype as del
    from pg_constraint c
    join pg_class cc on cc.oid = c.conrelid
    join pg_class pc on pc.oid = c.confrelid
    join pg_namespace n on n.oid = pc.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
    where c.contype = 'f' and pc.relname = ${table} and array_length(c.conkey, 1) = 1`));
}

/** Satırları ve onlara zincirleme bağlı satırları kopyaya ekler (aynı satır iki kez girmez) */
async function collect(tx: Tx, table: string, where: SQL, walk: boolean, acc: ArchivePayload, seen: Map<string, Set<string>>, count: { n: number }) {
  if (SKIP.has(table)) return;
  const t = ident(table);
  const found = rowsOf<{ r: Row }>(await tx.execute(sql`select to_jsonb(t) as r from ${t} t where ${where}`)).map((x) => x.r);
  const known = seen.get(table) ?? new Set<string>();
  seen.set(table, known);
  const fresh = found.filter((r) => { const k = r.id != null ? String(r.id) : JSON.stringify(r); if (known.has(k)) return false; known.add(k); return true; });
  if (fresh.length === 0) return;
  count.n += fresh.length;
  if (count.n > MAX_ROWS) throw new Error("Arşivlenecek kayıt çok büyük.");
  const part = acc.parts.find((p) => p.table === table);
  if (part) part.rows.push(...fresh); else acc.parts.push({ table, rows: fresh });
  if (!walk) return;
  for (const fk of await fksTo(tx, table)) {
    if (SKIP.has(fk.child)) continue;
    const vals = [...new Set(fresh.map((r) => r[fk.parent_col]).filter((v) => v !== null && v !== undefined))] as (string | number)[];
    if (vals.length === 0) continue;
    const cond = sql`${ident(fk.child_col)}::text in (${sql.join(vals.map((v) => sql`${String(v)}`), sql`, `)})`;
    if (fk.del === "c") await collect(tx, fk.child, cond, true, acc, seen, count);
    else if (fk.del === "n") {
      // Silinince boşaltılacak bağ: hangi satırın neye bağlı olduğu saklanır, geri alınca yeniden bağlanır
      const refs = rowsOf<{ id: number | null; v: unknown }>(await tx.execute(sql`select (to_jsonb(t)->>'id')::int as id, to_jsonb(t)->${fk.child_col} as v from ${ident(fk.child)} t where ${cond}`));
      for (const r of refs) if (r.id != null) acc.nulled.push({ table: fk.child, column: fk.child_col, id: r.id, value: r.v });
    }
  }
}

export type ArchiveTarget = { table: string; where: SQL; /** zincirleme bağlı satırlar da alınsın mı (varsayılan evet) */ walk?: boolean };

/**
 * Hedef satırları arşive kopyalar ve siler (tek işlemde). Hedefler verildiği sırayla kopyalanır, TERS sırayla silinir
 * (önce bağımlı olanlar). Silinecek hiçbir satır yoksa arşiv kaydı oluşmaz ve null döner.
 */
export async function archiveAndDelete(opts: { kind: ArchiveKind; label: string; by: number | null; targets: ArchiveTarget[] }): Promise<number | null> {
  return db.transaction(async (tx) => {
    const payload: ArchivePayload = { parts: [], nulled: [] };
    const seen = new Map<string, Set<string>>();
    const count = { n: 0 };
    for (const t of opts.targets) await collect(tx, t.table, t.where, t.walk !== false, payload, seen, count);
    if (count.n === 0) return null;
    const [item] = await tx.insert(archiveItems).values({ kind: opts.kind, label: opts.label.slice(0, 300), payload, rowCount: count.n, deletedBy: opts.by }).returning({ id: archiveItems.id });
    for (const t of [...opts.targets].reverse()) await tx.execute(sql`delete from ${ident(t.table)} where ${t.where}`);
    return item.id;
  });
}

export async function listArchive() {
  return db
    .select({ id: archiveItems.id, kind: archiveItems.kind, label: archiveItems.label, rowCount: archiveItems.rowCount, deletedAt: archiveItems.deletedAt, deletedByName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}` })
    .from(archiveItems)
    .leftJoin(users, eq(archiveItems.deletedBy, users.id))
    .orderBy(desc(archiveItems.deletedAt));
}

export type RestoreResult = { ok: true } | { ok: false; error: string };

/**
 * Arşiv kaydını geri yükler: satırlar özgün kimlikleriyle yeniden eklenir, boşaltılmış bağlar yeniden kurulur, arşiv kaydı
 * silinir. Hepsi tek işlemdedir; bir satır eklenemezse (aynı anahtar/kod/e-posta yeniden kullanılmış, bağlı olduğu kayıt
 * silinmiş) hiçbir şey değişmez ve neden söylenir.
 */
export async function restoreArchive(id: number): Promise<RestoreResult> {
  const [item] = await db.select().from(archiveItems).where(eq(archiveItems.id, id)).limit(1);
  if (!item) return { ok: false, error: "Arşiv kaydı bulunamadı (geri alınmış ya da silinmiş olabilir)." };
  const payload = item.payload as ArchivePayload;
  try {
    await db.transaction(async (tx) => {
      // Bir tablo başka bir tabloya bağlıysa önce o eklenmeli: sırası tutmayan parça ertelenir, ilerleme kalmayınca hata verilir
      let pending = payload.parts.filter((p) => p.rows.length > 0);
      while (pending.length > 0) {
        const next: Part[] = [];
        let lastError: unknown = null;
        for (const p of pending) {
          try {
            await tx.transaction(async (sp) => {
              const live = new Set(rowsOf<{ c: string }>(await sp.execute(sql`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = ${p.table}`)).map((x) => x.c));
              if (live.size === 0) throw new Error(`"${p.table}" tablosu artık yok.`);
              // Yalnızca hem kopyada hem tabloda bulunan sütunlar yazılır (sonradan eklenen sütunlar varsayılan değerini alır)
              const cols = Object.keys(p.rows[0]).filter((c) => live.has(c));
              const list = sql.join(cols.map((c) => ident(c)), sql`, `);
              await sp.execute(sql`insert into ${ident(p.table)} (${list}) select ${list} from jsonb_populate_recordset(null::${ident(p.table)}, ${JSON.stringify(p.rows)}::jsonb)`);
            });
          } catch (e) {
            if (!isForeignKeyViolation(e)) throw e;
            lastError = e;
            next.push(p);
          }
        }
        if (next.length === pending.length) throw lastError;
        pending = next;
      }
      for (const n of payload.nulled ?? []) {
        await tx.execute(sql`update ${ident(n.table)} set ${ident(n.column)} = (${JSON.stringify(n.value)}::jsonb #>> '{}')::int where id = ${n.id} and ${ident(n.column)} is null`);
      }
      await tx.delete(archiveItems).where(eq(archiveItems.id, id));
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Geri alınamadı: aynı anahtar, kod, adres ya da e-posta ile yeni bir kayıt oluşturulmuş. Önce o kaydı değiştir ya da kaldır, sonra yeniden dene." };
    if (isForeignKeyViolation(e)) return { ok: false, error: "Geri alınamadı: bu kaydın bağlı olduğu başka bir kayıt (kullanıcı, eğitim, anket…) artık yok." };
    console.error("[arsiv] geri alma hatası", e);
    return { ok: false, error: "Geri alınamadı. Kayıt arşivde duruyor; ayrıntı sunucu günlüğünde." };
  }
  return { ok: true };
}

export async function purgeArchive(id: number): Promise<RestoreResult> {
  const gone = await db.delete(archiveItems).where(eq(archiveItems.id, id)).returning({ id: archiveItems.id });
  return gone.length ? { ok: true } : { ok: false, error: "Arşiv kaydı bulunamadı." };
}

export async function archiveCount() {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(archiveItems);
  return r?.n ?? 0;
}
