ALTER TABLE "staff_accounts" ADD COLUMN "password_must_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
-- Backfill, same reasoning as the caregiver PIN one in 0003: every staff
-- password that exists today was set by an admin running db:create-staff, so an
-- admin knows every one of them. They must all be replaced on next sign-in.
-- Leaving these rows `false` would exempt exactly the accounts with the most
-- access — every patient address and every caregiver's file.
UPDATE "staff_accounts" SET "password_must_change" = true;
