CREATE TABLE "story_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"selected_story" jsonb NOT NULL,
	"thesis" text NOT NULL,
	"tone" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"kind" text NOT NULL,
	"order" integer NOT NULL,
	"content" text,
	"generated_content" text,
	"prompt_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "game_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sections" ADD CONSTRAINT "story_sections_report_id_story_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."story_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_reports_league_week_idx" ON "story_reports" USING btree ("league_id","week_id");--> statement-breakpoint
CREATE INDEX "story_reports_user_id_idx" ON "story_reports" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_sections_report_kind_uidx" ON "story_sections" USING btree ("report_id","kind");