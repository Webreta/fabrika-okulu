import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Build sırasında (next build) DATABASE_URL olmayabilir; postgres.js bağlantıyı ilk sorguda açar,
// bu yüzden import anında hata fırlatmak yerine geçici bir adres kullanılır.
const connectionString =
  process.env.DATABASE_URL || "postgres://build:build@localhost:5432/build";
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("DATABASE_URL tanımlı değil!");
}

// Dev'de hot-reload'da bağlantı sızıntısını önlemek için global cache
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(connectionString, { max: 10, connect_timeout: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
