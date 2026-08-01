ALTER TABLE "parlay_legs" ADD COLUMN "user_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlay_legs_user_id_idx" ON "parlay_legs" USING btree ("user_id");