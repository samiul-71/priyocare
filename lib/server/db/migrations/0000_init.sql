CREATE TYPE "public"."booking_source" AS ENUM('web', 'phone');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'dispatched', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."caregiver_skill" AS ENUM('phlebotomist', 'attendant', 'nurse', 'physiotherapist', 'babysitter');--> statement-breakpoint
CREATE TYPE "public"."complaint_source" AS ENUM('auto_low_rating', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'qualified', 'proposal_sent', 'negotiating', 'won', 'lost', 'dormant');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('bn', 'en');--> statement-breakpoint
CREATE TYPE "public"."ops_alert_type" AS ENUM('geofence_mismatch', 'missed_checkout', 'missed_checkin', 'report_overdue');--> statement-breakpoint
CREATE TYPE "public"."sample_status" AS ENUM('collected', 'in_transit', 'received_by_lab', 'processing', 'report_ready', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."service_archetype" AS ENUM('visit', 'placement', 'lead');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('ops', 'admin');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('customer', 'caregiver', 'staff');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'interview_scheduled', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."verification_step_type" AS ENUM('nid', 'photo', 'police_clearance', 'skill_cert', 'interview', 'references', 'safeguarding');--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint NOT NULL,
	"variant_id" bigint NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_snapshot" numeric(10, 2) NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_code" varchar(20) NOT NULL,
	"customer_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"service_id" bigint NOT NULL,
	"slot_id" bigint,
	"zone_id" bigint NOT NULL,
	"caregiver_id" bigint,
	"address_line" text NOT NULL,
	"landmark" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"prescription_url" text,
	"price_bdt" numeric(10, 2) NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"source" "booking_source" DEFAULT 'web' NOT NULL,
	"created_by_staff" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_code_unique" UNIQUE("booking_code")
);
--> statement-breakpoint
CREATE TABLE "care_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"tasks_completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"photo_url" text,
	"vitals" jsonb,
	"logged_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "caregiver_verification_steps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"step" "verification_step_type" NOT NULL,
	"completed_at" timestamp with time zone,
	"reviewed_by" bigint
);
--> statement-breakpoint
CREATE TABLE "caregivers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" varchar(15) NOT NULL,
	"skill" "caregiver_skill" NOT NULL,
	"bnmc_reg_no" varchar(30),
	"nid_front_url" text NOT NULL,
	"nid_back_url" text NOT NULL,
	"photo_url" text NOT NULL,
	"police_clearance_url" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pending' NOT NULL,
	"pin_hash" text,
	"bkash_payout_number" varchar(15),
	"zones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint NOT NULL,
	"caregiver_id" bigint,
	"source" "complaint_source" NOT NULL,
	"severity" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"actor_id" bigint NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_code" varchar(20) NOT NULL,
	"service_id" bigint NOT NULL,
	"user_id" bigint,
	"contact_name" text NOT NULL,
	"contact_phone" varchar(15) NOT NULL,
	"patient_age" smallint,
	"condition_summary" text,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destination_pref" text,
	"budget_range" text,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"owner_id" bigint,
	"next_action_at" timestamp with time zone,
	"estimated_value" numeric(12, 2),
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_lead_code_unique" UNIQUE("lead_code")
);
--> statement-breakpoint
CREATE TABLE "ops_alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint,
	"type" "ops_alert_type" NOT NULL,
	"distance_m" numeric(10, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"dob" timestamp,
	"gender" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_to_payer" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"gateway_ref" text,
	"amount_bdt" numeric(10, 2) NOT NULL,
	"is_international_card" boolean DEFAULT false NOT NULL,
	"webhook_payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" bigint NOT NULL,
	"barcode" varchar(32) NOT NULL,
	"status" "sample_status" DEFAULT 'collected' NOT NULL,
	"report_url" text,
	"collected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "samples_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "service_variants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_id" bigint NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"price_bdt" numeric(10, 2) NOT NULL,
	"duration_min" smallint,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "service_variants_name_bn_unicode" CHECK ("service_variants"."name_bn" ~ '[ঀ-৿]')
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"archetype" "service_archetype" NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"description_bn" text,
	"description_en" text,
	"prep_instructions_bn" text,
	"prep_instructions_en" text,
	"requires_prescription" boolean DEFAULT false NOT NULL,
	"required_skill" "caregiver_skill",
	"window_start" time,
	"window_end" time,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "services_name_bn_unicode" CHECK ("services"."name_bn" ~ '[ঀ-৿]')
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"zone_id" bigint NOT NULL,
	"service_id" bigint NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"capacity" smallint NOT NULL,
	"booked_count" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_capacity" CHECK ("slots"."booked_count" <= "slots"."capacity")
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" DEFAULT 'ops' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_uuid" varchar(64) NOT NULL,
	"caregiver_id" bigint NOT NULL,
	"booking_id" bigint,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_events_event_uuid_unique" UNIQUE("event_uuid")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(15) NOT NULL,
	"email" text,
	"locale" "locale" DEFAULT 'bn' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "variant_zone_prices" (
	"variant_id" bigint NOT NULL,
	"zone_id" bigint NOT NULL,
	"price_bdt" numeric(10, 2) NOT NULL,
	CONSTRAINT "variant_zone_prices_variant_id_zone_id_pk" PRIMARY KEY("variant_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_patient_profiles_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_staff_staff_accounts_id_fk" FOREIGN KEY ("created_by_staff") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_verification_steps" ADD CONSTRAINT "caregiver_verification_steps_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_verification_steps" ADD CONSTRAINT "caregiver_verification_steps_reviewed_by_staff_accounts_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_id_staff_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_staff_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_alerts" ADD CONSTRAINT "ops_alerts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_alerts" ADD CONSTRAINT "ops_alerts_reviewed_by_staff_accounts_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_zone_prices" ADD CONSTRAINT "variant_zone_prices_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_zone_prices" ADD CONSTRAINT "variant_zone_prices_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bookings_caregiver" ON "bookings" USING btree ("caregiver_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_slot" ON "bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_caregivers_status" ON "caregivers" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "idx_caregivers_zones" ON "caregivers" USING gin ("zones");--> statement-breakpoint
CREATE INDEX "idx_leads_stage" ON "leads" USING btree ("stage","next_action_at");--> statement-breakpoint
CREATE INDEX "idx_refresh_subject" ON "refresh_tokens" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_token_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_samples_barcode" ON "samples" USING btree ("barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_slots_zone_service_start" ON "slots" USING btree ("zone_id","service_id","window_start");