ALTER TYPE "public"."course_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "deleted_by" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;