import { getStaffActor } from "@/lib/server/auth/dal";
import { customersForExport, dhakaDayKey } from "@/lib/server/office/queries";
import { buildXlsx, type XlsxColumn } from "@/lib/server/office/xlsx";
import { customerFilterSchema } from "@/lib/shared/office-schemas";

export const dynamic = "force-dynamic";

/**
 * GET /office/customers/export — the customer directory as an `.xlsx`, filtered
 * by the same query params the list page uses, so the file is exactly the view
 * the admin was looking at.
 *
 * ADMIN ONLY, cookie-authorised. This is a browser navigation (an `<a>` the
 * page renders), not an API call, so it authorises off the `pc_session` cookie
 * via `getStaffActor` — the same actor the pages resolve — and answers with a
 * status rather than redirecting: the link only exists on the admin page, so a
 * non-admin here is an anomaly, not a flow to guide.
 *
 * A static segment, so it never collides with `/office/customers/[id]`.
 */
export async function GET(req: Request) {
  const actor = await getStaffActor();
  if (!actor) return new Response("Sign in first.", { status: 401 });
  if (actor.role !== "admin") return new Response("Admins only.", { status: 403 });

  const url = new URL(req.url);
  const f = customerFilterSchema.parse(Object.fromEntries(url.searchParams));
  const rows = await customersForExport(f);

  const columns: XlsxColumn[] = [
    { header: "Name", key: "name", type: "string" },
    { header: "Phone", key: "phone", type: "string" },
    { header: "Email", key: "email", type: "string" },
    { header: "Language", key: "language", type: "string" },
    { header: "Registered", key: "registered", type: "date" },
    { header: "Bookings", key: "bookingsCount", type: "number" },
    { header: "Completed bookings", key: "completedCount", type: "number" },
    { header: "Total spent (BDT)", key: "totalSpentBdt", type: "number" },
  ];

  const data = rows.map((r) => ({
    name: r.name,
    phone: r.phone,
    email: r.email,
    language: r.locale === "bn" ? "Bangla" : "English",
    // The Dhaka calendar day, matching how the rest of the app buckets dates.
    registered: dhakaDayKey(r.createdAt),
    bookingsCount: r.bookingsCount,
    completedCount: r.completedCount,
    totalSpentBdt: r.totalSpentBdt,
  }));

  const file = buildXlsx("Customers", columns, data);
  const today = dhakaDayKey(new Date());

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="customers-${today}.xlsx"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  });
}
