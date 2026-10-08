CREATE TABLE "pick_delegations" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"owner_user_id" varchar NOT NULL,
	"delegate_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlock_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" integer NOT NULL,
	"week_id" integer NOT NULL,
	"requested_by" varchar NOT NULL,
	"reason" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "shame_emoji" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "placed_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "approval_status" text;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "approval_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD COLUMN "approval_at" timestamp;--> statement-breakpoint
ALTER TABLE "pick_delegations" ADD CONSTRAINT "pick_delegations_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_delegations" ADD CONSTRAINT "pick_delegations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_delegations" ADD CONSTRAINT "pick_delegations_delegate_user_id_users_id_fk" FOREIGN KEY ("delegate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlock_requests" ADD CONSTRAINT "unlock_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pick_delegations_uidx" ON "pick_delegations" USING btree ("league_id","owner_user_id","delegate_user_id");--> statement-breakpoint
CREATE INDEX "pick_delegations_delegate_idx" ON "pick_delegations" USING btree ("league_id","delegate_user_id");--> statement-breakpoint
CREATE INDEX "unlock_requests_league_week_idx" ON "unlock_requests" USING btree ("league_id","week_id");--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_placed_by_user_id_users_id_fk" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_approval_by_user_id_users_id_fk" FOREIGN KEY ("approval_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uidx" ON "notifications" USING btree ("user_id","dedupe_key");