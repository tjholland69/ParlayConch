CREATE TABLE "bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"game_id" integer NOT NULL,
	"pick" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"spread" text,
	"spread_odds" text,
	"over_under" text,
	"over_odds" text,
	"under_odds" text,
	"moneyline_home" text,
	"moneyline_away" text,
	"game_time" timestamp NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"is_finished" boolean DEFAULT false,
	"winner" text,
	"venue" text,
	"weather" text,
	"home_record" text,
	"away_record" text
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"original_filename" text NOT NULL,
	"record_count" integer DEFAULT 0,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "league_week_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"locked_by" varchar NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"had_missing_bets" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"invite_code" text NOT NULL,
	"max_parlays_per_week" integer DEFAULT 1,
	"min_legs_per_parlay" integer DEFAULT 3,
	"max_legs_per_parlay" integer DEFAULT 5,
	"is_demo" boolean DEFAULT false,
	"use_demo_week_data" boolean DEFAULT false,
	"insights_enabled" boolean DEFAULT false,
	"lieutenant_permissions" jsonb,
	"notification_settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "leagues_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"league_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parlay_legs" (
	"id" serial PRIMARY KEY NOT NULL,
	"parlay_id" integer NOT NULL,
	"game_id" integer,
	"bet_type" text NOT NULL,
	"pick" text NOT NULL,
	"line" text,
	"odds" text,
	"game_segment" text,
	"result" text,
	"odds_enriched" boolean DEFAULT false,
	"player_name" text,
	"prop_type" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "parlays" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"league_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"source" text DEFAULT 'live',
	"import_batch_id" integer
);
--> statement-breakpoint
CREATE TABLE "player_week_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"season_type" text DEFAULT 'REG',
	"team" text,
	"completions" integer,
	"attempts" integer,
	"passing_yards" integer,
	"passing_tds" integer,
	"interceptions" integer,
	"passer_rating" real,
	"carries" integer,
	"rushing_yards" integer,
	"rushing_tds" integer,
	"receptions" integer,
	"targets" integer,
	"receiving_yards" integer,
	"receiving_tds" integer,
	"fantasy_points" real,
	"fantasy_points_ppr" real
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"nflverse_id" text,
	"name" text NOT NULL,
	"display_name" text,
	"position" text,
	"team" text,
	"headshot" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "players_nflverse_id_unique" UNIQUE("nflverse_id")
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"week_number" integer NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_passwords" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"password_hash" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"is_demo" boolean DEFAULT false,
	"is_super_user" boolean DEFAULT false,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user_passwords" ADD CONSTRAINT "user_passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_week_id_idx" ON "games" USING btree ("week_id");--> statement-breakpoint
CREATE INDEX "league_members_league_id_idx" ON "league_members" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "league_members_user_id_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parlay_legs_parlay_id_idx" ON "parlay_legs" USING btree ("parlay_id");--> statement-breakpoint
CREATE INDEX "parlays_user_league_week_idx" ON "parlays" USING btree ("user_id","league_id","week_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");