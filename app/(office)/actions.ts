"use server";

import { revalidatePath } from "next/cache";
import { clearPageSessionCookie, getStaffActor } from "@/lib/server/auth/dal";
import {
  createCaregiverApplication,
  createPhoneBooking,
  DuplicateCaregiverError,
  assignCaregiver,
  issueCaregiverPin,
  transitionVerificationStep,
  activateCaregiver,
  updateCaregiverFile,
} from "@/lib/server/office/mutations";
import {
  InvalidStageChangeError,
  LeadNotFoundError,
  updateLead,
} from "@/lib/server/leads/mutations";
import {
  createCaregiverSchema,
  dispatchSchema,
  phoneBookingSchema,
  updateCaregiverSchema,
  verifyStepSchema,
} from "@/lib/shared/office-schemas";
import { updateLeadSchema } from "@/lib/shared/lead-schemas";

/**
 * Office mutations as Server Actions (module 09).
 *
 * WHY THIS EXISTS: the office forms used to hold a Bearer access + refresh pair
 * in `localStorage`, because `/api/v1/office/*` authenticates with a header.
 * Any XSS on the origin could read those; the httpOnly `pc_session` cookie it
 * could not. These actions are authorised by that cookie instead, so **the
 * browser no longer holds an API credential at all** — the class of bug is gone
 * rather than mitigated.
 *
 * CSRF does not come back with them: Next invokes Server Actions by POST only
 * and rejects any request whose Origin does not match Host, and the cookie is
 * `SameSite=lax` besides.
 *
 * The `/api/v1/office/*` handlers stay exactly as they are — they are the API
 * for real API clients, and they keep their Bearer gate. This is a second
 * entrance for the browser, not a replacement.
 *
 * Every action re-checks the actor with `getStaffActor()`. A Server Action is a
 * public HTTP endpoint (Next 16 data-security guidance) — being importable only
 * by our own components authorises nothing.
 */

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string; fields?: Record<string, string[]> };

const SESSION_EXPIRED = {
  ok: false,
  error: "Your session expired — sign in again.",
} as const;

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    (fields[issue.path.join(".") || "_"] ??= []).push(issue.message);
  }
  return fields;
}

/* --------------------------------------------------------------- bookings */

export async function createPhoneBookingAction(
  input: unknown,
): Promise<ActionResult<{ bookingCode: string }>> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = phoneBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error.issues) };
  }

  const booking = await createPhoneBooking(parsed.data, staff.staffId);
  revalidatePath("/office/bookings");
  return { ok: true, data: { bookingCode: booking.bookingCode } };
}

export async function dispatchAction(bookingId: number, input: unknown): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = dispatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error.issues) };
  }

  try {
    await assignCaregiver(bookingId, parsed.data.caregiverId, parsed.data.reason);
    revalidatePath(`/office/bookings/${bookingId}/assign`);
    revalidatePath("/office/bookings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not dispatch." };
  }
}

/* ------------------------------------------------------------------ leads */

export async function updateLeadAction(leadId: number, input: unknown): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nothing to update." };
  }

  try {
    await updateLead(leadId, parsed.data, staff.staffId);
    revalidatePath("/office/leads");
    return { ok: true };
  } catch (err) {
    if (err instanceof LeadNotFoundError) return { ok: false, error: "Lead not found." };
    if (err instanceof InvalidStageChangeError) return { ok: false, error: err.message };
    throw err;
  }
}

/* ------------------------------------------------------------- caregivers */

export async function createCaregiverAction(input: unknown): Promise<ActionResult<{ id: number }>> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = createCaregiverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error.issues) };
  }

  try {
    const created = await createCaregiverApplication(parsed.data);
    revalidatePath("/office/caregivers");
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof DuplicateCaregiverError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateCaregiverAction(
  caregiverId: number,
  input: unknown,
): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = updateCaregiverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  }

  const updated = await updateCaregiverFile(caregiverId, parsed.data);
  if (!updated) return { ok: false, error: "Caregiver not found." };

  revalidatePath(`/office/caregivers/${caregiverId}/verify`);
  return { ok: true };
}

export async function verifyStepAction(caregiverId: number, input: unknown): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = verifyStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown verification step." };

  await transitionVerificationStep(caregiverId, parsed.data.step, staff.staffId);
  // Re-evaluate the §12.2 gate after every step — the server decides whether
  // the caregiver is activatable, never the form.
  await activateCaregiver(caregiverId);
  revalidatePath(`/office/caregivers/${caregiverId}/verify`);
  revalidatePath("/office/caregivers");
  return { ok: true };
}

/**
 * Issue the initial PIN. `issueCaregiverPin` re-checks the whole activation gate
 * from the database, so this action cannot become a way around §12.2 even if it
 * were called directly.
 */
export async function issuePinAction(caregiverId: number): Promise<ActionResult<{ pin: string }>> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const result = await issueCaregiverPin(caregiverId);
  if (result.ok) {
    revalidatePath(`/office/caregivers/${caregiverId}/verify`);
    revalidatePath("/office/caregivers");
    return { ok: true, data: { pin: result.pin } };
  }

  if (result.reason === "not_found") return { ok: false, error: "Caregiver not found." };
  if (result.reason === "already_issued") {
    return {
      ok: false,
      error: "This caregiver already has a PIN. Reset it instead of re-issuing.",
    };
  }
  return {
    ok: false,
    error: `Cannot issue a PIN yet — outstanding: ${result.missing?.join(", ")}`,
  };
}

/* ---------------------------------------------------------------- session */

/**
 * Sign out. Since the office browser holds no tokens any more, dropping the
 * httpOnly cookie IS the sign-out — there is nothing else left to revoke, which
 * was the point of moving these mutations off Bearer.
 *
 * Defined here rather than imported from the (auth) group because the
 * boundaries rule forbids `components/office` depending on `auth` code, and
 * that actor wall is worth more than the two lines it costs.
 */
export async function signOutStaffAction(): Promise<void> {
  await clearPageSessionCookie();
}
