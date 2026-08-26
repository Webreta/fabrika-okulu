CREATE TABLE "course_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"related_course_id" integer NOT NULL,
	"trigger" text DEFAULT 'completed' NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_relations" ADD CONSTRAINT "course_relations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_relations" ADD CONSTRAINT "course_relations_related_course_id_courses_id_fk" FOREIGN KEY ("related_course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_relations_course_idx" ON "course_relations" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_relations_uq" ON "course_relations" USING btree ("course_id","related_course_id","trigger");