ALTER TABLE "courses" ADD COLUMN "promo_course_id" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "promo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_promo_course_id_courses_id_fk" FOREIGN KEY ("promo_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;