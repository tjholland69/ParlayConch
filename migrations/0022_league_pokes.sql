CREATE TABLE "league_pokes" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"seen_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "league_pokes" ADD CONSTRAINT "league_pokes_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_pokes" ADD CONSTRAINT "league_pokes_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_pokes" ADD CONSTRAINT "league_pokes_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_pokes_league_to_idx" ON "league_pokes" USING btree ("league_id","to_user_id");