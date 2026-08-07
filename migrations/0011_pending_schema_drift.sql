CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"actor_user_id" varchar,
	"target_type" varchar(50),
	"target_id" varchar(100),
	"success" boolean DEFAULT true NOT NULL,
	"status_code" integer,
	"ip" varchar(64),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_index_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_index_id" integer NOT NULL,
	"shared_with_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_indexes" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"scope" text DEFAULT 'private',
	"published_league_id" integer,
	"filters" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parlay_leg_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"parlay_leg_id" integer NOT NULL,
	"raised_by_user_id" varchar NOT NULL,
	"reason_type" text NOT NULL,
	"justification" text NOT NULL,
	"screenshot_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"abbreviation" text NOT NULL,
	"full_name" text NOT NULL,
	"city" text NOT NULL,
	"nickname" text NOT NULL,
	"conference" text,
	"division" text,
	"stadium_name" text,
	"stadium_type" text,
	"is_turf" boolean,
	"owner" text,
	"head_coach" text,
	"primary_color" text,
	"secondary_color" text,
	"logo_url" text,
	CONSTRAINT "teams_abbreviation_unique" UNIQUE("abbreviation")
);
--> statement-breakpoint
DROP INDEX "parlays_user_league_week_idx";--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "game_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "weeks" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "start_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "purged_at" timestamp;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "loser_label" text DEFAULT 'parlay_loser';--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "hero_label" text DEFAULT 'parlay_hero';--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "user_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "odds_source" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "enrichment_log" text;--> statement-breakpoint
ALTER TABLE "parlays" ADD COLUMN "status_group" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_index_shares" ADD CONSTRAINT "custom_index_shares_custom_index_id_custom_indexes_id_fk" FOREIGN KEY ("custom_index_id") REFERENCES "public"."custom_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_index_shares" ADD CONSTRAINT "custom_index_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_indexes" ADD CONSTRAINT "custom_indexes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_indexes" ADD CONSTRAINT "custom_indexes_published_league_id_leagues_id_fk" FOREIGN KEY ("published_league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes" ADD CONSTRAINT "parlay_leg_disputes_parlay_leg_id_parlay_legs_id_fk" FOREIGN KEY ("parlay_leg_id") REFERENCES "public"."parlay_legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes" ADD CONSTRAINT "parlay_leg_disputes_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_leg_disputes" ADD CONSTRAINT "parlay_leg_disputes_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sections" ADD CONSTRAINT "story_sections_report_id_story_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."story_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_event_type_idx" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_index_shares_uidx" ON "custom_index_shares" USING btree ("custom_index_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX "custom_index_shares_user_id_idx" ON "custom_index_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "custom_indexes_owner_id_idx" ON "custom_indexes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "custom_indexes_published_league_id_idx" ON "custom_indexes" USING btree ("published_league_id");--> statement-breakpoint
CREATE INDEX "parlay_leg_disputes_leg_id_idx" ON "parlay_leg_disputes" USING btree ("parlay_leg_id");--> statement-breakpoint
CREATE INDEX "parlay_leg_disputes_status_idx" ON "parlay_leg_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "story_reports_league_week_idx" ON "story_reports" USING btree ("league_id","week_id");--> statement-breakpoint
CREATE INDEX "story_reports_user_id_idx" ON "story_reports" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_sections_report_kind_uidx" ON "story_sections" USING btree ("report_id","kind");--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_members_league_active_idx" ON "league_members" USING btree ("league_id","is_active");--> statement-breakpoint
CREATE INDEX "parlay_legs_user_id_idx" ON "parlay_legs" USING btree ("user_id");