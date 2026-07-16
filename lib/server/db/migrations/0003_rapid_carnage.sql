ALTER TABLE "caregivers" ADD COLUMN "pin_must_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "pin_changed_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: every PIN that exists today was issued by Ops (that is the only
-- path that sets one), so Ops knows every one of them. They must all be
-- replaced on next sign-in. Defaulting these rows to `false` would silently
-- exempt exactly the caregivers this change exists to protect.
UPDATE "caregivers" SET "pin_must_change" = true WHERE "pin_hash" IS NOT NULL;
