// Canlıda yönetici hesabını hazırlar (scripts/start.sh her açılışta çağırır).
//   ADMIN_EMAIL + ADMIN_PASSWORD tanımlı değilse hiçbir şey yapmaz.
//   Hesap yoksa yönetici olarak oluşturur.
//   Hesap varsa şifresine DOKUNMAZ (panelden değiştirilen şifre her açılışta eskiye dönmesin);
//   yalnızca yönetici rolünü ve etkinliğini sağlar. ADMIN_PASSWORD_RESET=1 ise şifreyi de günceller.
// Şifre depoya yazılmaz; yalnızca sunucunun ortam değişkenlerinde durur.
import "dotenv/config";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = (process.env.ADMIN_NAME ?? "Yönetici").trim() || "Yönetici";
const reset = ["1", "true", "on"].includes((process.env.ADMIN_PASSWORD_RESET ?? "").trim().toLowerCase());

if (!email || !password) process.exit(0);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("ensure-admin: ADMIN_EMAIL geçerli bir e-posta değil; atlandı.");
  process.exit(0);
}
if (password.trim().length < 8) {
  console.error("ensure-admin: ADMIN_PASSWORD en az 8 karakter olmalı; atlandı.");
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ensure-admin: DATABASE_URL tanımlı değil; atlandı.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [u] = await sql`select id, role, active from users where lower(email) = ${email} limit 1`;
  if (!u) {
    const hash = await bcrypt.hash(password, 12);
    await sql`insert into users (email, first_name, last_name, password_hash, role, active) values (${email}, ${name}, '', ${hash}, 'admin', true)`;
    console.log(`ensure-admin: yönetici hesabı oluşturuldu (${email}).`);
  } else if (reset) {
    const hash = await bcrypt.hash(password, 12);
    await sql`update users set password_hash = ${hash}, role = 'admin', active = true, updated_at = now() where id = ${u.id}`;
    await sql`delete from sessions where user_id = ${u.id}`;
    console.log(`ensure-admin: yönetici şifresi güncellendi (${email}); ADMIN_PASSWORD_RESET değişkenini kaldırın.`);
  } else if (u.role !== "admin" || !u.active) {
    await sql`update users set role = 'admin', active = true, updated_at = now() where id = ${u.id}`;
    console.log(`ensure-admin: hesap yönetici yapıldı (${email}); şifreye dokunulmadı.`);
  }
} catch (e) {
  console.error("ensure-admin: hata:", e?.message ?? e);
} finally {
  await sql.end();
}
