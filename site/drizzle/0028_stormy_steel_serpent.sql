CREATE TABLE "module_openings" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"opens_at" timestamp with time zone,
	"opened_by" integer,
	"notified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "unlock_mode" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "unlock_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "unlock_time" time;--> statement-breakpoint
ALTER TABLE "module_openings" ADD CONSTRAINT "module_openings_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_openings" ADD CONSTRAINT "module_openings_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_openings" ADD CONSTRAINT "module_openings_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_openings_uq" ON "module_openings" USING btree ("module_id","period_id");--> statement-breakpoint
CREATE INDEX "module_openings_period_idx" ON "module_openings" USING btree ("period_id");