// NOTE: unlike other lib/server files, schema.ts intentionally omits
// `import "server-only"`. It is DDL/type definitions with no secrets and is
// imported by the drizzle-kit migration CLI (a Node tool that does not apply
// Next's client conditions and would crash on the guard). Client-safety is
// still enforced: the DB *client* (./index.ts) and every query/mutation module
// carry `import "server-only"`, and nothing here opens a connection.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * PriyoCare data model (master PRD §7). PostgreSQL + Drizzle, per ADR-001.
 *
 * This file is the single source of truth for the database. It is `server-only`
 * so it can never be pulled into a client bundle; DB access lives entirely here
 * (PRD §10.5 — the monolith's replacement for the old "only the API repo has
 * credentials" wall).
 *
 * The `service_archetype` discriminator drives everything (PRD §3.2):
 *   visit → slot/dispatch/check-in · placement → subscription · lead → CRM.
 */

/* --------------------------------------------------------------------------
 * A Bangla `*_bn` column must contain at least one character from the Bengali
 * Unicode block (U+0980–U+09FF). Legacy Bijoy/ANSI text is Latin/Windows-1252
 * bytes that only *look* Bangla, so it contains no Bengali-block code points
 * and is rejected here at the database (PRD §18.1). The Zod layer additionally
 * enforces a concentration threshold. `ঀ`/`৿` become the literal
 * range characters in the emitted SQL.
 * ------------------------------------------------------------------------ */
function banglaUnicodeCheck(name: string, column: unknown) {
  return check(name, sql`${column} ~ '[ঀ-৿]'`);
}

/* ------------------------------------------------------------------ enums */

export const serviceArchetype = pgEnum("service_archetype", [
  "visit",
  "placement",
  "lead",
]);

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "dispatched",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "dormant",
]);

export const caregiverSkill = pgEnum("caregiver_skill", [
  "phlebotomist",
  "attendant",
  "nurse",
  "physiotherapist",
  "babysitter",
]);

export const verificationStatus = pgEnum("verification_status", [
  "pending",
  "interview_scheduled",
  "approved",
  "rejected",
  "suspended",
]);

export const verificationStepType = pgEnum("verification_step_type", [
  "nid",
  "photo",
  "police_clearance",
  "skill_cert",
  "interview",
  "references", // babysitter-only (PRD §12.2)
  "safeguarding", // babysitter-only (PRD §12.2)
]);

export const sampleStatus = pgEnum("sample_status", [
  "collected",
  "in_transit",
  "received_by_lab",
  "processing",
  "report_ready",
  "rejected",
]);

export const subjectType = pgEnum("subject_type", [
  "customer",
  "caregiver",
  "staff",
]);

export const staffRole = pgEnum("staff_role", ["ops", "admin"]);

export const locale = pgEnum("locale", ["bn", "en"]);

export const bookingSource = pgEnum("booking_source", ["web", "phone"]);

export const complaintSource = pgEnum("complaint_source", [
  "auto_low_rating",
  "manual",
]);

export const opsAlertType = pgEnum("ops_alert_type", [
  "geofence_mismatch",
  "missed_checkout",
  "missed_checkin",
  "report_overdue",
]);

/* --------------------------------------------------------------- catalogue */

export const zones = pgTable("zones", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const services = pgTable(
  "services",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    slug: text("slug").notNull().unique(),
    archetype: serviceArchetype("archetype").notNull(), // drives everything
    nameBn: text("name_bn").notNull(), // Unicode only (§18)
    nameEn: text("name_en").notNull(),
    descriptionBn: text("description_bn"),
    descriptionEn: text("description_en"),
    prepInstructionsBn: text("prep_instructions_bn"),
    prepInstructionsEn: text("prep_instructions_en"),
    requiresPrescription: boolean("requires_prescription").notNull().default(false),
    requiredSkill: caregiverSkill("required_skill"), // NULL for 'lead'
    windowStart: time("window_start"),
    windowEnd: time("window_end"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [banglaUnicodeCheck("services_name_bn_unicode", t.nameBn)],
);

// The 15 nursing procedures are VARIANTS here, not 15 services (PRD §3.3).
export const serviceVariants = pgTable(
  "service_variants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id),
    nameBn: text("name_bn").notNull(),
    nameEn: text("name_en").notNull(), // "IV Cannula", "NG Tube Setup"…
    priceBdt: numeric("price_bdt", { precision: 10, scale: 2 }).notNull(),
    durationMin: smallint("duration_min"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [banglaUnicodeCheck("service_variants_name_bn_unicode", t.nameBn)],
);

export const variantZonePrices = pgTable(
  "variant_zone_prices",
  {
    variantId: bigint("variant_id", { mode: "number" })
      .notNull()
      .references(() => serviceVariants.id),
    zoneId: bigint("zone_id", { mode: "number" })
      .notNull()
      .references(() => zones.id),
    priceBdt: numeric("price_bdt", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.zoneId] })],
);

/* ----------------------------------------------------------------- accounts */

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 15 }).notNull().unique(), // OTP-verified
  email: text("email"),
  locale: locale("locale").notNull().default("bn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffAccounts = pgTable("staff_accounts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // argon2id
  role: staffRole("role").notNull().default("ops"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subjectType: subjectType("subject_type").notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_refresh_subject").on(t.subjectType, t.subjectId),
    index("idx_refresh_token_hash").on(t.tokenHash),
  ],
);

// The payer is usually NOT the patient (PRD §7.7).
export const patientProfiles = pgTable("patient_profiles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  dob: timestamp("dob", { withTimezone: false }),
  gender: text("gender"),
  conditions: jsonb("conditions").notNull().default(sql`'[]'::jsonb`),
  relationshipToPayer: text("relationship_to_payer"),
});

/* --------------------------------------------------------------- caregivers */

export const caregivers = pgTable(
  "caregivers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fullName: text("full_name").notNull(),
    phone: varchar("phone", { length: 15 }).notNull(),
    skill: caregiverSkill("skill").notNull(),
    bnmcRegNo: varchar("bnmc_reg_no", { length: 30 }), // mandatory when skill='nurse'
    nidFrontUrl: text("nid_front_url").notNull(),
    nidBackUrl: text("nid_back_url").notNull(),
    photoUrl: text("photo_url").notNull(),
    policeClearanceUrl: text("police_clearance_url").notNull(),
    verificationStatus: verificationStatus("verification_status")
      .notNull()
      .default("pending"),
    pinHash: text("pin_hash"), // set at activation; null before approval (§12.2)
    /**
     * True while the PIN is the one OPS issued. Ops necessarily knows it — they
     * read it out — so the caregiver is forced to replace it before she can do
     * anything, and after that nobody but her knows her credential.
     */
    pinMustChange: boolean("pin_must_change").notNull().default(false),
    /**
     * When the credential last changed. Sessions issued BEFORE this are stale
     * and refused: a page-session cookie is a stateless JWT and cannot be
     * revoked server-side, so this timestamp is what invalidates one. Without
     * it, an Ops user who signed in with the initial PIN would keep a 30-day
     * session after she changed it — which would defeat the whole point.
     */
    pinChangedAt: timestamp("pin_changed_at", { withTimezone: true }),
    bkashPayoutNumber: varchar("bkash_payout_number", { length: 15 }),
    zones: jsonb("zones").notNull().default(sql`'[]'::jsonb`),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_caregivers_status").on(t.verificationStatus),
    index("idx_caregivers_zones").using("gin", t.zones),
  ],
);

export const caregiverVerificationSteps = pgTable(
  "caregiver_verification_steps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caregiverId: bigint("caregiver_id", { mode: "number" })
      .notNull()
      .references(() => caregivers.id),
    step: verificationStepType("step").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedBy: bigint("reviewed_by", { mode: "number" }).references(
      () => staffAccounts.id,
    ),
  },
);

/* ------------------------------------------------------------------- slots */

export const slots = pgTable(
  "slots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    zoneId: bigint("zone_id", { mode: "number" })
      .notNull()
      .references(() => zones.id),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id), // capacity is per-service
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    capacity: smallint("capacity").notNull(),
    bookedCount: smallint("booked_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_slots_zone_service_start").on(
      t.zoneId,
      t.serviceId,
      t.windowStart,
    ),
    check("chk_capacity", sql`${t.bookedCount} <= ${t.capacity}`),
  ],
);

/* ---------------------------------------------------------------- bookings */

export const bookings = pgTable(
  "bookings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bookingCode: varchar("booking_code", { length: 20 }).notNull().unique(), // PC-260715-0042
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    patientId: bigint("patient_id", { mode: "number" })
      .notNull()
      .references(() => patientProfiles.id),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id),
    slotId: bigint("slot_id", { mode: "number" }).references(() => slots.id),
    zoneId: bigint("zone_id", { mode: "number" })
      .notNull()
      .references(() => zones.id),
    caregiverId: bigint("caregiver_id", { mode: "number" }).references(
      () => caregivers.id,
    ),
    addressLine: text("address_line").notNull(),
    landmark: text("landmark").notNull(), // required. Dhaka runs on landmarks.
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    prescriptionUrl: text("prescription_url"),
    priceBdt: numeric("price_bdt", { precision: 10, scale: 2 }).notNull(),
    status: bookingStatus("status").notNull().default("pending"),
    isSubscription: boolean("is_subscription").notNull().default(false),
    source: bookingSource("source").notNull().default("web"), // measure the shift
    createdByStaff: bigint("created_by_staff", { mode: "number" }).references(
      () => staffAccounts.id,
    ),
    // Reason stored when Ops dispatches a non-top-ranked caregiver (AC 3.1).
    dispatchOverrideReason: text("dispatch_override_reason"),
    /**
     * Client-supplied retry key (module 09 §3, S-1). UNIQUE: a retried
     * POST /bookings returns the original booking instead of taking a second
     * slot and a second payment. Nullable — Ops' phone bookings do not carry
     * one, and a booking without a key is still a valid booking.
     */
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_bookings_status").on(t.status),
    index("idx_bookings_caregiver").on(t.caregiverId),
    index("idx_bookings_slot").on(t.slotId),
    // The constraint is the race protection, not the SELECT in createBooking:
    // two simultaneous retries both miss the read, and exactly one insert wins.
    uniqueIndex("uq_bookings_idempotency_key").on(t.idempotencyKey),
  ],
);

export const bookingItems = pgTable("booking_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" })
    .notNull()
    .references(() => bookings.id),
  variantId: bigint("variant_id", { mode: "number" })
    .notNull()
    .references(() => serviceVariants.id),
  // never join to live catalogue for history — snapshot at booking time
  nameSnapshot: text("name_snapshot").notNull(),
  priceSnapshot: numeric("price_snapshot", { precision: 10, scale: 2 }).notNull(),
  quantity: smallint("quantity").notNull().default(1),
});

/* ------------------------------------------------------------------- leads */

export const leads = pgTable(
  "leads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadCode: varchar("lead_code", { length: 20 }).notNull().unique(),
    serviceId: bigint("service_id", { mode: "number" })
      .notNull()
      .references(() => services.id), // archetype must be 'lead'
    userId: bigint("user_id", { mode: "number" }).references(() => users.id), // most arrive by phone
    contactName: text("contact_name").notNull(),
    contactPhone: varchar("contact_phone", { length: 15 }).notNull(),
    patientAge: smallint("patient_age"),
    conditionSummary: text("condition_summary"), // "father, 62, cardiac bypass"
    documents: jsonb("documents").notNull().default(sql`'[]'::jsonb`),
    destinationPref: text("destination_pref"), // medical tourism only
    budgetRange: text("budget_range"),
    stage: leadStage("stage").notNull().default("new"),
    ownerId: bigint("owner_id", { mode: "number" }).references(() => staffAccounts.id),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }), // follow-up reminder
    estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
    lostReason: text("lost_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_leads_stage").on(t.stage, t.nextActionAt)],
);

export const leadActivities = pgTable("lead_activities", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" })
    .notNull()
    .references(() => leads.id),
  actorId: bigint("actor_id", { mode: "number" })
    .notNull()
    .references(() => staffAccounts.id),
  type: text("type").notNull(), // call | whatsapp | email | meeting | note
  summary: text("summary").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------- samples */

export const samples = pgTable(
  "samples",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bookingId: bigint("booking_id", { mode: "number" })
      .notNull()
      .references(() => bookings.id),
    barcode: varchar("barcode", { length: 32 }).notNull().unique(),
    status: sampleStatus("status").notNull().default("collected"),
    reportUrl: text("report_url"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_samples_barcode").on(t.barcode)],
);

/* --------------------------------------------------- field work & finance */

export const careLogs = pgTable("care_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" })
    .notNull()
    .references(() => bookings.id),
  caregiverId: bigint("caregiver_id", { mode: "number" })
    .notNull()
    .references(() => caregivers.id),
  tasksCompleted: jsonb("tasks_completed").notNull().default(sql`'[]'::jsonb`),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  vitals: jsonb("vitals"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(), // device time — authoritative
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

export const payments = pgTable("payments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" })
    .notNull()
    .references(() => bookings.id),
  method: text("method").notNull(),
  status: text("status").notNull(),
  gatewayRef: text("gateway_ref"),
  amountBdt: numeric("amount_bdt", { precision: 10, scale: 2 }).notNull(),
  isInternationalCard: boolean("is_international_card").notNull().default(false),
  webhookPayload: jsonb("webhook_payload"), // redacted
});

export const complaints = pgTable("complaints", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" })
    .notNull()
    .references(() => bookings.id),
  caregiverId: bigint("caregiver_id", { mode: "number" }).references(
    () => caregivers.id,
  ),
  source: complaintSource("source").notNull(),
  severity: text("severity"),
  status: text("status").notNull().default("open"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Geofence flags — visible ONLY in /office/alerts (PRD §9, §11).
export const opsAlerts = pgTable("ops_alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" }).references(() => bookings.id),
  type: opsAlertType("type").notNull(),
  distanceM: numeric("distance_m", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("open"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }).references(
    () => staffAccounts.id,
  ),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The idempotency table for offline sync (PRD §9). event_uuid is UNIQUE.
export const syncEvents = pgTable("sync_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventUuid: varchar("event_uuid", { length: 64 }).notNull().unique(),
  caregiverId: bigint("caregiver_id", { mode: "number" })
    .notNull()
    .references(() => caregivers.id),
  bookingId: bigint("booking_id", { mode: "number" }).references(() => bookings.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), // device-captured
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});
