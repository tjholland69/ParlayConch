CREATE TABLE IF NOT EXISTS "custom_indexes" (
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
CREATE TABLE IF NOT EXISTS "custom_index_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_index_id" integer NOT NULL,
	"shared_with_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_indexes" ADD CONSTRAINT "custom_indexes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_indexes" ADD CONSTRAINT "custom_indexes_published_league_id_leagues_id_fk" FOREIGN KEY ("published_league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_index_shares" ADD CONSTRAINT "custom_index_shares_custom_index_id_custom_indexes_id_fk" FOREIGN KEY ("custom_index_id") REFERENCES "public"."custom_indexes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_index_shares" ADD CONSTRAINT "custom_index_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_indexes_owner_id_idx" ON "custom_indexes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_indexes_published_league_id_idx" ON "custom_indexes" USING btree ("published_league_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_index_shares_uidx" ON "custom_index_shares" USING btree ("custom_index_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_index_shares_user_id_idx" ON "custom_index_shares" USING btree ("shared_with_user_id");
