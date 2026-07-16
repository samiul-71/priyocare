import { redirect } from "next/navigation";

/**
 * /caregiver has no content of its own — today's job is the app (§5). The
 * manifest's start_url points straight at /caregiver/today; this redirect
 * catches anyone arriving at the bare path.
 *
 * The guard lives on the destination: redirecting first means an anonymous
 * visitor lands on /caregiver/today's `requireCaregiverPage`, which sends them
 * to login with the right `?next=`.
 */
export default function CaregiverHome() {
  redirect("/caregiver/today");
}
