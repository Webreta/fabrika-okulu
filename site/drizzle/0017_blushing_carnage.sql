CREATE TABLE "course_prerequisites" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"required_course_id" integer NOT NULL,
	"condition" text DEFAULT 'enrolled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_prerequisites_course_id_unique" UNIQUE("course_id")
);
--> statement-breakpoint
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_required_course_id_courses_id_fk" FOREIGN KEY ("required_course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_prerequisites_required_idx" ON "course_prerequisites" USING btree ("required_course_id");