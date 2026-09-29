ALTER TABLE "courses" ADD COLUMN "preorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "opens_at" date;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "preorder_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "open_notified_at" timestamp with time zone;