CREATE TABLE "pick_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"game_id" integer NOT NULL,
	"bet_type" text NOT NULL,
	"pick" text NOT NULL,
	"line" text,
	"odds" text,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "suggestion_id" integer;--> statement-breakpoint
ALTER TABLE "pick_suggestions" ADD CONSTRAINT "pick_suggestions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_suggestions" ADD CONSTRAINT "pick_suggestions_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_suggestions" ADD CONSTRAINT "pick_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_suggestions" ADD CONSTRAINT "pick_suggestions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pick_suggestions_member_bet_uidx" ON "pick_suggestions" USING btree ("league_id","week_id","user_id","game_id","bet_type","pick");--> statement-breakpoint
CREATE INDEX "pick_suggestions_user_idx" ON "pick_suggestions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_suggestion_id_pick_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."pick_suggestions"("id") ON DELETE set null ON UPDATE no action;