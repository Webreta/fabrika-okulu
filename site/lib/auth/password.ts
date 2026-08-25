import { hash, compare } from "bcryptjs";

const COST = 12;

export function hashPassword(password: string) {
  return hash(password, COST);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

// Kullanıcı bulunamadığında da compare çalıştırılır ki yanıt süresi
// "email var/yok" bilgisini sızdırmasın.
export const DUMMY_HASH =
  "$2b$12$0FAQf0V5Sl5SeUQKdLTrt.yOZBjM/l.MaQiApy4JLEWdRuMzkmGca";
