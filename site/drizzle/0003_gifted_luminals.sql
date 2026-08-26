CREATE TABLE "survey_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"survey_key" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "survey_completions" ADD CONSTRAINT "survey_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_completions_uq" ON "survey_completions" USING btree ("user_id","survey_key");