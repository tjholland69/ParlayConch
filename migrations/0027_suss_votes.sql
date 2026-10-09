CREATE TABLE "leg_suss_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"parlay_leg_id" integer NOT NULL,
	"voter_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leg_suss_votes" ADD CONSTRAINT "leg_suss_votes_parlay_leg_id_parlay_legs_id_fk" FOREIGN KEY ("parlay_leg_id") REFERENCES "public"."parlay_legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leg_suss_votes" ADD CONSTRAINT "leg_suss_votes_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leg_suss_votes_leg_voter_uidx" ON "leg_suss_votes" USING btree ("parlay_leg_id","voter_user_id");