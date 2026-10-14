CREATE TABLE "user_contacts" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"phone_number" varchar,
	"phone_verified_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "parlays" ADD COLUMN "actual_odds" text;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A phone number used to sit in users.settings (under notificationPreferences),
-- which is sent to everyone in a member's leagues. Carry over the ones that
-- parse as a real number, then take it out of settings either way.
INSERT INTO "user_contacts" ("user_id", "phone_number")
SELECT "id",
  CASE
    WHEN "raw" LIKE '+%' AND length("digits") BETWEEN 8 AND 15 THEN '+' || "digits"
    WHEN length("digits") = 10 THEN '+1' || "digits"
    WHEN length("digits") = 11 AND left("digits", 1) = '1' THEN '+' || "digits"
  END
FROM (
  SELECT "id",
    btrim("settings"->'notificationPreferences'->>'phone') AS "raw",
    regexp_replace(coalesce("settings"->'notificationPreferences'->>'phone', ''), '\D', '', 'g') AS "digits"
  FROM "users"
) AS "old"
WHERE ("raw" LIKE '+%' AND length("digits") BETWEEN 8 AND 15)
   OR length("digits") = 10
   OR (length("digits") = 11 AND left("digits", 1) = '1')
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
UPDATE "users" SET "settings" = "settings" #- '{notificationPreferences,phone}'
WHERE jsonb_typeof("settings"->'notificationPreferences') = 'object' AND "settings"->'notificationPreferences' ? 'phone';
