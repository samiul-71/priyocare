"use server";

import { revalidatePath } from "next/cache";
import { clearPageSessionCookie, getStaffActor } from "@/lib/server/auth/dal";
import {
  createCaregiverApplication,
  createPhoneBooking,
  DuplicateCaregiverError,
  assignCaregiver,
  issueCaregiverPin,
  rejectCaregiver,
  reopenCaregiverApplication,
  transitionVerificationStep,
  activateCaregiver,
  updateCaregiverFile,
} from "@/lib/server/office/mutations";
import {
  InvalidStageChangeError,
  LeadNotFoundError,
  updateLead,
} from "@/lib/server/leads/mutations";
import { resetCaregiverPin } from "@/lib/server/caregiver/pin";
import { resetStaffPassword } from "@/lib/server/auth/staff-password";
import {
  createCaregiverSchema,
  dispatchSchema,
  phoneBookingSchema,
  rejectCaregiverSchema,
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

/**
 * Reset a forgotten PIN (§12.2). Separate from `issuePinAction`, which refuses
 * once a PIN exists — that refusal protects a working caregiver from being
 * locked out by a stray click, so getting her back in must be a deliberate act,
 * not a retry.
 *
 * Ops verifies who they are talking to the same way they did at the interview.
 * The new PIN is must-change, so their knowledge of it lasts only until her
 * next sign-in — and every session the old PIN opened is revoked here.
 */
export async function resetPinAction(caregiverId: number): Promise<ActionResult<{ pin: string }>> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const result = await resetCaregiverPin(caregiverId);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not_approved"
          ? "This caregiver is not active — reinstate them before resetting a PIN."
          : "Caregiver not found.",
    };
  }

  revalidatePath(`/office/caregivers/${caregiverId}/verify`);
  revalidatePath("/office/caregivers");
  return { ok: true, data: { pin: result.pin } };
}

/**
 * Reject an application, with a reason that is actually recorded (§12.2).
 * Refuses an approved caregiver — that is what suspend is for.
 */
export async function rejectCaregiverAction(
  caregiverId: number,
  input: unknown,
): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const parsed = rejectCaregiverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "A reason is required." };
  }

  const result = await rejectCaregiver(caregiverId, parsed.data.reason, staff.staffId);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "already_approved"
          ? "She is already approved — suspend her instead of rejecting the application."
          : "Caregiver not found.",
    };
  }

  revalidatePath(`/office/caregivers/${caregiverId}/verify`);
  revalidatePath("/office/caregivers");
  return { ok: true };
}

/**
 * Reopen a rejected application. Without this, rejection is a trap: the phone
 * number is unique, so a woman who comes back with a valid clearance cannot
 * re-apply, and a rejection made in error locks a real person out permanently.
 */
export async function reopenCaregiverAction(caregiverId: number): Promise<ActionResult> {
  const staff = await getStaffActor();
  if (!staff) return SESSION_EXPIRED;

  const reopened = await reopenCaregiverApplication(caregiverId, staff.staffId);
  if (!reopened) return { ok: false, error: "That application is not rejected." };

  revalidatePath(`/office/caregivers/${caregiverId}/verify`);
  revalidatePath("/office/caregivers");
  return { ok: true };
}

/* ------------------------------------------------------------------ staff */

/**
 * Admin resets a colleague's forgotten password (§10.1).
 *
 * ADMIN ONLY — checked here AND again in `resetStaffPassword`. An `ops` user
 * resetting an admin's password would be a straight privilege escalation: take
 * the temp password, sign in as the admin, and the role system is decoration.
 *
 * Self-reset is refused (see resetStaffPassword): an admin who knows their
 * password should change it; one who has forgotten it cannot use a route that
 * requires being signed in anyway. Allowing it would just mean a walked-up
 * unlocked laptop mints a fresh admin credential without anyone noticing.
 */
export async function resetStaffPasswordAction(
  staffId: number,
): Promise<ActionResult<{ password: string }>> {
  const actor = await getStaffActor();
  if (!actor) return SESSION_EXPIRED;
  if (actor.role !== "admin") {
    return { ok: false, error: "Only an admin can reset a colleague's password." };
  }

  const result = await resetStaffPassword(staffId, actor.staffId);
  if (result.ok) {
    revalidatePath("/office/staff");
    return { ok: true, data: { password: result.password } };
  }

  return {
    ok: false,
    error:
      result.reason === "self"
        ? "You cannot reset your own password here — use Change password instead."
        : result.reason === "inactive"
          ? "That account is deactivated — reactivate it before resetting a password."
          : "Staff account not found.",
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
