CREATE TABLE "survey_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"course_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_courses" ADD CONSTRAINT "survey_courses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_courses" ADD CONSTRAINT "survey_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_courses_uq" ON "survey_courses" USING btree ("survey_id","course_id");