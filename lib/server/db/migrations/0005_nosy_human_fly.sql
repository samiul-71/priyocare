ALTER TABLE "caregivers" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "status_changed_by" bigint;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_status_changed_by_staff_accounts_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;