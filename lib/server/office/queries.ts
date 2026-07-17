import "server-only";

import { and, count, desc, eq, exists, gte, ilike, isNotNull, lt, not, notInArray, or, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db";
import {
  bookings,
  careLogs,
  caregiverVerificationSteps,
  caregivers,
  complaints,
  leads,
  opsAlerts,
  patientProfiles,
  samples,
  services,
  staffAccounts,
  staffServices,
  users,
  zones,
} from "../db/schema";
import type { CustomerFilter } from "../../shared/office-schemas";
import {
  rankEligibleCaregivers,
  type CaregiverForDispatch,
} from "../../shared/dispatch";
import { evaluateActivation, requiredStepsFor } from "../../shared/onboarding";

/**
 * Office read models (PRD §5). All reads are no-DB-safe: without a configured
 * database they return empty, so the pages render their empty state instead of
 * crashing. On the VPS they return live data.
 */

export interface BookingQueueRow {
  id: number;
  bookingCode: string;
  patientName: string | null;
  serviceName: string;
  zoneName: string;
  status: string;
  source: string;
  priceBdt: string;
  createdAt: Date;
}

export async function listBookingQueue(): Promise<BookingQueueRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      patientName: patientProfiles.name,
      serviceName: services.nameEn,
      zoneName: zones.name,
      status: bookings.status,
      source: bookings.source,
      priceBdt: bookings.priceBdt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .leftJoin(patientProfiles, eq(bookings.patientId, patientProfiles.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(zones, eq(bookings.zoneId, zones.id))
    .orderBy(desc(bookings.createdAt))
    .limit(100) as unknown as Promise<BookingQueueRow[]>;
}

export interface OpsAlertRow {
  id: number;
  bookingId: number | null;
  type: string;
  distanceM: string | null;
  status: string;
  createdAt: Date;
}

// Geofence/missed-checkout flags — visible ONLY here (PRD §9, §11, AC 4.2).
export async function listOpsAlerts(): Promise<OpsAlertRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: opsAlerts.id,
      bookingId: opsAlerts.bookingId,
      type: opsAlerts.type,
      distanceM: opsAlerts.distanceM,
      status: opsAlerts.status,
      createdAt: opsAlerts.createdAt,
    })
    .from(opsAlerts)
    .where(eq(opsAlerts.status, "open"))
    .orderBy(desc(opsAlerts.createdAt))
    .limit(100);
}

/**
 * Eligible caregivers for a booking, ranked (PRD §9). Filters approved + skill
 * + zone via the pure `rankEligibleCaregivers`. NOTE: busy-window conflict
 * detection needs each caregiver's current assignments — wired in module 07/09;
 * here `busyWindows` is empty, so ranking covers approval/skill/zone/rating.
 */
export async function listEligibleForBooking(bookingId: number) {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const [booking] = await db
    .select({
      zoneId: bookings.zoneId,
      zoneName: zones.name,
      requiredSkill: services.requiredSkill,
    })
    .from(bookings)
    .leftJoin(zones, eq(bookings.zoneId, zones.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking?.requiredSkill) return [];

  const rows = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      verificationStatus: caregivers.verificationStatus,
      skill: caregivers.skill,
      zones: caregivers.zones,
      ratingAvg: caregivers.ratingAvg,
    })
    .from(caregivers)
    .where(and(eq(caregivers.verificationStatus, "approved"), eq(caregivers.skill, booking.requiredSkill)));

  const candidates: (CaregiverForDispatch & { fullName: string })[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    verificationStatus: r.verificationStatus,
    skill: r.skill,
    zones: (r.zones as Array<string | number>) ?? [],
    ratingAvg: Number(r.ratingAvg),
    busyWindows: [],
    servedPatientBefore: false,
  }));

  return rankEligibleCaregivers(candidates, {
    requiredSkill: booking.requiredSkill,
    zone: booking.zoneName ?? booking.zoneId,
    windowStart: 0,
    windowEnd: 0,
  });
}

/* ------------------------------------------------- caregiver onboarding (§12.2) */

export interface CaregiverRow {
  id: number;
  fullName: string;
  phone: string;
  skill: string;
  verificationStatus: string;
  /** Whether a login PIN has been issued — never the PIN or its hash. */
  hasPin: boolean;
  stepsDone: number;
  stepsRequired: number;
  canActivate: boolean;
  /** Why she is rejected/suspended — null otherwise. Ops must never guess. */
  statusReason: string | null;
}

/**
 * The onboarding board: every caregiver and how far through the checklist they
 * are. `hasPin` is a boolean derived from `pin_hash IS NOT NULL` — the hash
 * itself never leaves the database layer, and there is no query anywhere that
 * selects it into a page.
 */
export async function listCaregivers(): Promise<CaregiverRow[]> {
  if (!isDbConfigured()) return [];
  const db = getDb();

  const rows = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      phone: caregivers.phone,
      skill: caregivers.skill,
      verificationStatus: caregivers.verificationStatus,
      hasPin: sql<boolean>`${caregivers.pinHash} is not null`,
      bnmcRegNo: caregivers.bnmcRegNo,
      bkashPayoutNumber: caregivers.bkashPayoutNumber,
      statusReason: caregivers.statusReason,
    })
    .from(caregivers)
    .orderBy(desc(caregivers.createdAt));

  const steps = await db
    .select({
      caregiverId: caregiverVerificationSteps.caregiverId,
      step: caregiverVerificationSteps.step,
      completedAt: caregiverVerificationSteps.completedAt,
    })
    .from(caregiverVerificationSteps);

  return rows.map((cg) => {
    const done = steps
      .filter((s) => s.caregiverId === cg.id && s.completedAt !== null)
      .map((s) => s.step);
    const activation = evaluateActivation({
      skill: cg.skill,
      completedSteps: done,
      payoutNumber: cg.bkashPayoutNumber ?? null,
      bnmcRegNo: cg.bnmcRegNo ?? null,
    });
    return {
      id: cg.id,
      fullName: cg.fullName,
      phone: cg.phone,
      skill: cg.skill,
      verificationStatus: cg.verificationStatus,
      hasPin: cg.hasPin,
      stepsDone: done.length,
      stepsRequired: requiredStepsFor(cg.skill).length,
      canActivate: activation.canActivate,
      statusReason: cg.statusReason,
    };
  });
}

export interface CaregiverDetail extends CaregiverRow {
  bnmcRegNo: string | null;
  bkashPayoutNumber: string | null;
  completedSteps: string[];
  requiredSteps: string[];
  /** Exactly what is still blocking activation — shown to Ops verbatim. */
  missing: string[];
}

/** One caregiver's file, with the checklist and precisely what is missing. */
export async function getCaregiverDetail(caregiverId: number): Promise<CaregiverDetail | null> {
  if (!isDbConfigured()) return null;
  const db = getDb();

  const [cg] = await db
    .select({
      id: caregivers.id,
      fullName: caregivers.fullName,
      phone: caregivers.phone,
      skill: caregivers.skill,
      verificationStatus: caregivers.verificationStatus,
      hasPin: sql<boolean>`${caregivers.pinHash} is not null`,
      bnmcRegNo: caregivers.bnmcRegNo,
      bkashPayoutNumber: caregivers.bkashPayoutNumber,
      statusReason: caregivers.statusReason,
    })
    .from(caregivers)
    .where(eq(caregivers.id, caregiverId))
    .limit(1);

  if (!cg) return null;

  const stepRows = await db
    .select({
      step: caregiverVerificationSteps.step,
      completedAt: caregiverVerificationSteps.completedAt,
    })
    .from(caregiverVerificationSteps)
    .where(eq(caregiverVerificationSteps.caregiverId, caregiverId));

  const completedSteps = stepRows.filter((s) => s.completedAt !== null).map((s) => s.step);
  const requiredSteps = requiredStepsFor(cg.skill);
  const activation = evaluateActivation({
    skill: cg.skill,
    completedSteps,
    payoutNumber: cg.bkashPayoutNumber ?? null,
    bnmcRegNo: cg.bnmcRegNo ?? null,
  });

  return {
    ...cg,
    completedSteps,
    requiredSteps,
    stepsDone: completedSteps.length,
    stepsRequired: requiredSteps.length,
    canActivate: activation.canActivate,
    missing: activation.missing,
  };
}

/* -------------------------------------------------------- staff accounts */

export interface StaffRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  /** True while the password is still the one an admin handed over. */
  mustChangePassword: boolean;
  createdAt: Date;
}

/**
 * Who has access to the office panel. Admin-only (the page enforces it).
 *
 * There was no way to see this at all before — an admin panel that cannot
 * answer "who can read every patient's address?" is missing something more
 * basic than a feature. `password_hash` is never selected; `mustChangePassword`
 * is the only credential-adjacent fact that leaves this layer.
 */
export async function listStaff(): Promise<StaffRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({
      id: staffAccounts.id,
      name: staffAccounts.name,
      email: staffAccounts.email,
      role: staffAccounts.role,
      isActive: staffAccounts.isActive,
      mustChangePassword: staffAccounts.passwordMustChange,
      createdAt: staffAccounts.createdAt,
    })
    .from(staffAccounts)
    .orderBy(desc(staffAccounts.createdAt));
}

export interface LeadServiceRow {
  id: number;
  nameEn: string;
  isActive: boolean;
}

/**
 * The lead-archetype services — the only ones a staff member can be put on a
 * rota for (§9). Visit and placement services dispatch a caregiver to a house
 * and have nothing to do with lead ownership.
 *
 * Inactive ones are included: a service can be switched off in the catalogue
 * while staff are still mapped to it, and silently hiding that mapping would
 * make the rota look emptier than it is.
 */
export async function listLeadServices(): Promise<LeadServiceRow[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ id: services.id, nameEn: services.nameEn, isActive: services.isActive })
    .from(services)
    .where(eq(services.archetype, "lead"))
    .orderBy(services.sortOrder);
}

/** Every staff↔lead-service pairing, for the rota grid on /office/staff. */
export async function listStaffServices(): Promise<{ staffId: number; serviceId: number }[]> {
  if (!isDbConfigured()) return [];
  return getDb()
    .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
    .from(staffServices);
}

/* ------------------------------------------------------------- dashboard */

export interface CountRow {
  label: string;
  count: number;
}

export interface TrendPoint {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  orders: number;
  revenueBdt: number;
}

export interface DashboardMetrics {
  /** Realised revenue = sum of COMPLETED bookings' price, this calendar month. */
  revenueThisMonthBdt: number;
  ordersThisMonth: number;
  ordersTotal: number;
  bookingsByStatus: CountRow[];
  customersTotal: number;
  customersNewThisMonth: number;
  /** Samples whose report is ready — "reports delivered" to date. */
  reportsReady: number;
  /** Orders + completed-revenue per day for the last 30 days, gap-filled. */
  trend: TrendPoint[];
  leadsByStage: CountRow[];
  leadsWon: number;
  leadsLost: number;
  /** won / (won + lost), as a percentage; null when no lead has closed yet. */
  conversionPct: number | null;
  caregiversByStatus: CountRow[];
  complaintsByStatus: CountRow[];
  openComplaints: number;
  overdueLeads: number;
  openAlerts: number;
  generatedAt: Date;
}

function emptyMetrics(now: Date): DashboardMetrics {
  return {
    revenueThisMonthBdt: 0,
    ordersThisMonth: 0,
    ordersTotal: 0,
    bookingsByStatus: [],
    customersTotal: 0,
    customersNewThisMonth: 0,
    reportsReady: 0,
    trend: gapFilledDays(now, 30, new Map()),
    leadsByStage: [],
    leadsWon: 0,
    leadsLost: 0,
    conversionPct: null,
    caregiversByStatus: [],
    complaintsByStatus: [],
    openComplaints: 0,
    overdueLeads: 0,
    openAlerts: 0,
    generatedAt: now,
  };
}

/*
 * All day/month bucketing is done in Dhaka time, not the server's. On the VPS
 * (likely UTC) a naive `toISOString()` day would flip at 6am local and put a
 * booking on the wrong day — and, worse, the JS axis and the SQL `date_trunc`
 * would bucket in DIFFERENT zones and never line up. Bangladesh keeps a fixed
 * +6 offset with no DST, so a constant is exact and needs no tz database.
 */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Dhaka calendar day of an instant, as `YYYY-MM-DD`. */
export function dhakaDayKey(d: Date): string {
  return new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Build a dense N-day axis (ending today, Dhaka) so a quiet day is a zero, not a missing bar. */
function gapFilledDays(
  now: Date,
  days: number,
  found: Map<string, { orders: number; revenueBdt: number }>,
): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dhakaDayKey(new Date(now.getTime() - i * DAY_MS));
    out.push({ day, orders: found.get(day)?.orders ?? 0, revenueBdt: found.get(day)?.revenueBdt ?? 0 });
  }
  return out;
}

/**
 * Everything the admin dashboard shows, in one call (§7 business status). Admin
 * only — the page enforces it; this loader holds no gate of its own, so it must
 * never be reached from an ops-visible surface.
 *
 * Revenue is realised revenue: the sum of COMPLETED bookings' price, not booked
 * or pending value. Payments start `pending` and the gateway webhook that would
 * mark them paid is still deferred (§19), so payment status cannot be trusted for
 * money yet — a finished job is the honest signal that value was delivered. The
 * month boundary is the server's calendar month.
 */
export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
  if (!isDbConfigured()) return emptyMetrics(now);

  const db = getDb();
  // The Dhaka calendar month start, as an absolute instant (Dhaka 1st 00:00).
  const [y, mo] = dhakaDayKey(now).split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, mo - 1, 1) - DHAKA_OFFSET_MS);
  // A day of slack on the lookback so day −29 is never trimmed by the filter.
  const trendStart = new Date(now.getTime() - 31 * DAY_MS);

  const completed = eq(bookings.status, "completed");

  const [
    bookingsByStatus,
    revenueRow,
    ordersThisMonthRow,
    customersTotalRow,
    customersNewRow,
    reportsReadyRow,
    trendRows,
    leadsByStage,
    caregiversByStatus,
    complaintsByStatus,
    openComplaintsRow,
    overdueLeadsRow,
    openAlertsRow,
  ] = await Promise.all([
    db.select({ label: bookings.status, count: count() }).from(bookings).groupBy(bookings.status),
    db
      .select({ sum: sql<string>`coalesce(sum(${bookings.priceBdt}), 0)` })
      .from(bookings)
      .where(and(completed, gte(bookings.createdAt, monthStart))),
    db.select({ count: count() }).from(bookings).where(gte(bookings.createdAt, monthStart)),
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, monthStart)),
    db.select({ count: count() }).from(samples).where(eq(samples.status, "report_ready")),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${bookings.createdAt} AT TIME ZONE 'Asia/Dhaka'), 'YYYY-MM-DD')`,
        orders: count(),
        revenue: sql<string>`coalesce(sum(${bookings.priceBdt}) filter (where ${bookings.status} = 'completed'), 0)`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, trendStart))
      .groupBy(sql`date_trunc('day', ${bookings.createdAt} AT TIME ZONE 'Asia/Dhaka')`),
    db.select({ label: leads.stage, count: count() }).from(leads).groupBy(leads.stage),
    db
      .select({ label: caregivers.verificationStatus, count: count() })
      .from(caregivers)
      .groupBy(caregivers.verificationStatus),
    db.select({ label: complaints.status, count: count() }).from(complaints).groupBy(complaints.status),
    db.select({ count: count() }).from(complaints).where(eq(complaints.status, "open")),
    db
      .select({ count: count() })
      .from(leads)
      .where(
        and(
          isNotNull(leads.nextActionAt),
          lt(leads.nextActionAt, now),
          notInArray(leads.stage, ["won", "lost", "dormant"]),
        ),
      ),
    db.select({ count: count() }).from(opsAlerts).where(eq(opsAlerts.status, "open")),
  ]);

  const trendMap = new Map(
    trendRows.map((r) => [r.day, { orders: Number(r.orders), revenueBdt: Number(r.revenue) }]),
  );
  const leadsWon = leadsByStage.find((r) => r.label === "won")?.count ?? 0;
  const leadsLost = leadsByStage.find((r) => r.label === "lost")?.count ?? 0;
  const closed = leadsWon + leadsLost;

  return {
    revenueThisMonthBdt: Number(revenueRow[0]?.sum ?? 0),
    ordersThisMonth: ordersThisMonthRow[0]?.count ?? 0,
    ordersTotal: bookingsByStatus.reduce((sum, r) => sum + r.count, 0),
    bookingsByStatus,
    customersTotal: customersTotalRow[0]?.count ?? 0,
    customersNewThisMonth: customersNewRow[0]?.count ?? 0,
    reportsReady: reportsReadyRow[0]?.count ?? 0,
    trend: gapFilledDays(now, 30, trendMap),
    leadsByStage,
    leadsWon,
    leadsLost,
    conversionPct: closed === 0 ? null : Math.round((leadsWon / closed) * 100),
    caregiversByStatus,
    complaintsByStatus,
    openComplaints: openComplaintsRow[0]?.count ?? 0,
    overdueLeads: overdueLeadsRow[0]?.count ?? 0,
    openAlerts: openAlertsRow[0]?.count ?? 0,
    generatedAt: now,
  };
}

/* -------------------------------------------------------- customer directory */

/** The instant of a Dhaka calendar day's 00:00 (YYYY-MM-DD → absolute time). */
function dhakaDayStartInstant(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DHAKA_OFFSET_MS);
}

/**
 * The WHERE for the customer directory, shared by the list, its count, and the
 * export — so all three describe the exact same set. Returns undefined when no
 * filter is active (show everyone).
 *
 * `hasBookings` is an EXISTS on bookings rather than a join + HAVING: it keeps
 * the count query join-free and does not multiply rows. The date window is
 * inclusive on both ends, read as Dhaka days — `to` becomes "before the start of
 * the day after", so a customer who registered at 11pm on the `to` date is in.
 */
function customerWhere(f: CustomerFilter) {
  const conds = [];
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(users.name, like), ilike(users.phone, like), ilike(users.email, like)));
  }
  if (f.locale) conds.push(eq(users.locale, f.locale));
  if (f.from) conds.push(gte(users.createdAt, dhakaDayStartInstant(f.from)));
  if (f.to) conds.push(lt(users.createdAt, new Date(dhakaDayStartInstant(f.to).getTime() + DAY_MS)));
  if (f.hasBookings) {
    const hasAny = exists(
      getDb().select({ one: sql`1` }).from(bookings).where(eq(bookings.customerId, users.id)),
    );
    conds.push(f.hasBookings === "yes" ? hasAny : not(hasAny));
  }
  return conds.length ? and(...conds) : undefined;
}

export interface CustomerListRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  locale: string;
  createdAt: Date;
  bookingsCount: number;
  completedCount: number;
  totalSpentBdt: number;
}

const customerSelection = {
  id: users.id,
  name: users.name,
  phone: users.phone,
  email: users.email,
  locale: users.locale,
  createdAt: users.createdAt,
  bookingsCount: sql<number>`count(${bookings.id})::int`,
  completedCount: sql<number>`(count(${bookings.id}) filter (where ${bookings.status} = 'completed'))::int`,
  totalSpentBdt: sql<string>`coalesce(sum(${bookings.priceBdt}) filter (where ${bookings.status} = 'completed'), 0)`,
} as const;

type CustomerSelectRow = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  locale: string;
  createdAt: Date;
  bookingsCount: number;
  completedCount: number;
  totalSpentBdt: string;
};

function toCustomerRow(r: CustomerSelectRow): CustomerListRow {
  return { ...r, totalSpentBdt: Number(r.totalSpentBdt) };
}

export interface CustomerPage {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The customer directory (admin only, PRD §6 — customer accounts). Each row
 * carries its booking count and realised spend (completed bookings only, the
 * same honest definition the dashboard uses), so the admin sees value at a
 * glance without opening every file.
 *
 * `total` is a separate count query, not the page length, so pagination knows
 * how many pages exist. Both use `customerWhere`, so the count and the page can
 * never disagree about who matches.
 */
export async function listCustomers(f: CustomerFilter, pageSize = 25): Promise<CustomerPage> {
  if (!isDbConfigured()) return { rows: [], total: 0, page: f.page, pageSize };

  const db = getDb();
  const where = customerWhere(f);
  const offset = (f.page - 1) * pageSize;

  const [rows, totalRow] = await Promise.all([
    db
      .select(customerSelection)
      .from(users)
      .leftJoin(bookings, eq(bookings.customerId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: count() }).from(users).where(where),
  ]);

  return {
    rows: rows.map(toCustomerRow),
    total: totalRow[0]?.n ?? 0,
    page: f.page,
    pageSize,
  };
}

/**
 * Every matching customer, flat, for the spreadsheet — the same filter as the
 * list but without paging. Capped so a runaway export can never try to
 * materialise the whole table into one file; if a real export ever hits the cap
 * that is the signal to add streaming, not to raise it silently.
 */
export async function customersForExport(f: CustomerFilter, cap = 50_000): Promise<CustomerListRow[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb()
    .select(customerSelection)
    .from(users)
    .leftJoin(bookings, eq(bookings.customerId, users.id))
    .where(customerWhere(f))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(cap);
  return rows.map(toCustomerRow);
}

export interface CustomerActivity {
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    locale: string;
    createdAt: Date;
  } | null;
  bookings: {
    id: number;
    bookingCode: string;
    serviceName: string | null;
    status: string;
    priceBdt: string;
    source: string;
    createdAt: Date;
  }[];
  leads: {
    id: number;
    leadCode: string;
    serviceName: string | null;
    stage: string;
    createdAt: Date;
  }[];
  samples: {
    id: number;
    barcode: string;
    status: string;
    bookingCode: string;
    collectedAt: Date;
  }[];
  complaints: {
    id: number;
    status: string;
    severity: string | null;
    source: string;
    bookingCode: string;
    createdAt: Date;
  }[];
  careVisits: {
    id: number;
    bookingCode: string;
    caregiverName: string | null;
    loggedAt: Date;
  }[];
}

/**
 * One customer and everything they have touched (admin only). Bookings, leads,
 * lab samples, complaints and care visits, each read from the row that already
 * links to them — a customer's whole history in one page, so "what happened with
 * this family?" does not mean five separate searches.
 *
 * This is a read of sensitive data (a patient's address lives on their bookings,
 * §10.5), which is exactly why the page gates it to `admin`. No caregiver phone
 * or geofence coordinate is selected here — only what the office already handles.
 */
export async function getCustomerActivity(customerId: number): Promise<CustomerActivity> {
  const empty: CustomerActivity = {
    customer: null,
    bookings: [],
    leads: [],
    samples: [],
    complaints: [],
    careVisits: [],
  };
  if (!isDbConfigured()) return empty;

  const db = getDb();
  const [customerRow] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      locale: users.locale,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, customerId))
    .limit(1);

  if (!customerRow) return empty;

  const [bookingRows, leadRows, sampleRows, complaintRows, careRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        serviceName: services.nameEn,
        status: bookings.status,
        priceBdt: bookings.priceBdt,
        source: bookings.source,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .leftJoin(services, eq(bookings.serviceId, services.id))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(bookings.createdAt)),
    db
      .select({
        id: leads.id,
        leadCode: leads.leadCode,
        serviceName: services.nameEn,
        stage: leads.stage,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(services, eq(leads.serviceId, services.id))
      .where(eq(leads.userId, customerId))
      .orderBy(desc(leads.createdAt)),
    db
      .select({
        id: samples.id,
        barcode: samples.barcode,
        status: samples.status,
        bookingCode: bookings.bookingCode,
        collectedAt: samples.collectedAt,
      })
      .from(samples)
      .innerJoin(bookings, eq(samples.bookingId, bookings.id))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(samples.collectedAt)),
    db
      .select({
        id: complaints.id,
        status: complaints.status,
        severity: complaints.severity,
        source: complaints.source,
        bookingCode: bookings.bookingCode,
        createdAt: complaints.createdAt,
      })
      .from(complaints)
      .innerJoin(bookings, eq(complaints.bookingId, bookings.id))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(complaints.createdAt)),
    db
      .select({
        id: careLogs.id,
        bookingCode: bookings.bookingCode,
        caregiverName: caregivers.fullName,
        loggedAt: careLogs.loggedAt,
      })
      .from(careLogs)
      .innerJoin(bookings, eq(careLogs.bookingId, bookings.id))
      .leftJoin(caregivers, eq(careLogs.caregiverId, caregivers.id))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(careLogs.loggedAt)),
  ]);

  return {
    customer: customerRow,
    bookings: bookingRows,
    leads: leadRows,
    samples: sampleRows,
    complaints: complaintRows,
    careVisits: careRows,
  };
}
