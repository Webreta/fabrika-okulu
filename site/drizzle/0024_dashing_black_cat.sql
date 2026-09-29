ALTER TABLE "orders" ADD COLUMN "coupon_reserved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
-- Mevcut ödenmiş siparişler: kayıt ve kupon sayımı zaten yapılmıştı
UPDATE "orders" SET "fulfilled_at" = COALESCE("paid_at", "created_at") WHERE "status" = 'paid' AND "fulfilled_at" IS NULL;--> statement-breakpoint
UPDATE "orders" SET "coupon_reserved" = true WHERE "status" = 'paid' AND "coupon_code" IS NOT NULL;--> statement-breakpoint
-- Dönem son kayıt tarihi saat dilimi hatası yüzünden başlangıçtan 2 gün önceye yazılmıştı; doğrusu 1 gün önce
UPDATE "periods" SET "enrollment_deadline" = "start_date" - 1 WHERE "enrollment_deadline" = "start_date" - 2;
