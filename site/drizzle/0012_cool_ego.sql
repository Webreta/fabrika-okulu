CREATE TABLE "period_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"period_id" integer,
	"user_id" integer,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "period_waitlist" ADD CONSTRAINT "period_waitlist_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_waitlist" ADD CONSTRAINT "period_waitlist_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_waitlist" ADD CONSTRAINT "period_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "period_waitlist_uq" ON "period_waitlist" USING btree ("course_id","email");--> statement-breakpoint
CREATE INDEX "period_waitlist_course_idx" ON "period_waitlist" USING btree ("course_id");