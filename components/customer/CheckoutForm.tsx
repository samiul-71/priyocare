"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createBookingSchema } from "@/lib/shared/booking-schemas";
import { computeBookingTotal } from "@/lib/shared/pricing";
import { remainingCapacity } from "@/lib/shared/slots";
import { ZONES } from "@/lib/shared/catalogue-seed";
import type { Cart } from "./ItemSelector";

interface OpenSlot {
  id: number;
  windowStart: string;
  windowEnd: string;
  capacity: number;
  bookedCount: number;
}

const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "card", "cash"] as const;
const DEFAULT_LAT = 23.8306; // Mirpur DOHS — the map pin sets these later
const DEFAULT_LNG = 90.3654;

// Read the cart from sessionStorage as an external store — the React-blessed
// way to read browser-only state without a hydration mismatch or a setState
// in an effect.
function readCartRaw(): string | null {
  return typeof window === "undefined" ? null : window.sessionStorage.getItem("pc_cart");
}
function subscribeStorage(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Checkout (PRD §5, §9). Shows the itemised total (client mirror of the server
 * re-check), collects patient/address/landmark/zone/slot/payment, and submits.
 * Only OPEN slots ever render (AC 1.1) — the picker consumes GET /api/v1/slots,
 * which excludes full slots server-side.
 */
export function CheckoutForm() {
  const router = useRouter();
  const cartRaw = useSyncExternalStore(subscribeStorage, readCartRaw, () => null);
  const cart = useMemo<Cart | null>(
    () => (cartRaw ? (JSON.parse(cartRaw) as Cart) : null),
    [cartRaw],
  );
  const [zoneId, setZoneId] = useState<number>(1);
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [slotId, setSlotId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load open slots whenever zone/service changes (full slots never returned).
  useEffect(() => {
    if (!cart) return;
    let active = true;
    fetch(`/api/v1/slots?zone_id=${zoneId}&service_id=${cart.serviceId}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d) => active && setSlots(d.slots ?? []))
      .catch(() => active && setSlots([]));
    return () => {
      active = false;
    };
  }, [cart, zoneId]);

  if (!cart) {
    return (
      <p className="rounded-[10px] border border-border bg-surface-alt p-4 text-text-muted">
        Your cart is empty. Choose a service to start a booking.
      </p>
    );
  }

  const total = computeBookingTotal(cart.items);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cart) return;
    setSubmitError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      serviceId: cart.serviceId,
      zoneId,
      slotId,
      patientName: fd.get("patientName"),
      patientPhone: fd.get("patientPhone"),
      addressLine: fd.get("addressLine"),
      landmark: fd.get("landmark"),
      lat: DEFAULT_LAT,
      lng: DEFAULT_LNG,
      items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      priceBdt: total,
      paymentMethod: fd.get("paymentMethod"),
    };

    const parsed = createBookingSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_");
        (fe[key] ??= []).push(issue.message);
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.sessionStorage.removeItem("pc_cart");
        router.push(`/book/confirmation?code=${encodeURIComponent(data.bookingCode)}`);
      } else if (res.status === 409) {
        setSubmitError("This slot just filled — please pick another.");
      } else if (res.status === 422 && data?.error?.code === "price_mismatch") {
        setSubmitError("The price changed — please review your items.");
      } else {
        setSubmitError(data?.error?.message ?? "Could not create the booking.");
      }
    } catch {
      setSubmitError("Network error — please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  const err = (name: string) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-danger">{errors[name].join(" ")}</p>
    ) : null;
  const field = "mt-1 w-full rounded-md border border-border px-3 py-2 text-sm";

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 md:grid-cols-2">
      <div>
        <fieldset className="mb-4">
          <legend className="mb-2 font-semibold text-navy">Patient</legend>
          <label className="block text-sm" htmlFor="patientName">Name</label>
          <input id="patientName" name="patientName" className={field} />
          {err("patientName")}
          <label className="mt-3 block text-sm" htmlFor="patientPhone">Phone</label>
          <input id="patientPhone" name="patientPhone" inputMode="tel" placeholder="01XXXXXXXXX" className={field} />
          {err("patientPhone")}
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 font-semibold text-navy">Address</legend>
          <label className="block text-sm" htmlFor="zone">Zone</label>
          <select
            id="zone"
            className={field}
            value={zoneId}
            onChange={(e) => setZoneId(Number(e.target.value))}
          >
            {ZONES.map((z, i) => (
              <option key={z} value={i + 1}>{z}</option>
            ))}
          </select>
          <label className="mt-3 block text-sm" htmlFor="addressLine">Address</label>
          <input id="addressLine" name="addressLine" className={field} />
          {err("addressLine")}
          <label className="mt-3 block text-sm" htmlFor="landmark">Landmark (required)</label>
          <input id="landmark" name="landmark" className={field} />
          {err("landmark")}
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-semibold text-navy">Time slot</legend>
          {slots.length === 0 ? (
            <p className="text-sm text-text-muted">
              No open slots for this zone today — try another zone or call the hotline.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {slots.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <input
                      type="radio"
                      name="slot"
                      checked={slotId === s.id}
                      onChange={() => setSlotId(s.id)}
                    />
                    <span>
                      {new Date(s.windowStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      <span className="ml-1 text-text-muted">({remainingCapacity(s)} left)</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>

      <div>
        <div className="rounded-[10px] border border-border bg-surface-alt p-4">
          <h2 className="mb-2 font-semibold text-navy">{cart.serviceName}</h2>
          <ul className="mb-3 text-sm">
            {cart.items.map((it) => (
              <li key={it.variantId} className="flex justify-between">
                <span lang="en">{it.nameEn} × {it.quantity}</span>
                <span className="tabular">{(it.priceBdt * it.quantity).toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border pt-2 font-semibold text-navy">
            <span>Total</span>
            <span className="tabular">{total.toLocaleString("en-US")} BDT</span>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 font-semibold text-navy">Payment</legend>
          <label className="block text-sm" htmlFor="paymentMethod">Method</label>
          <select id="paymentMethod" name="paymentMethod" defaultValue="cash" className={field}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </fieldset>

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-navy px-6 font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Confirming…" : `Confirm & pay ${total.toLocaleString("en-US")} BDT`}
        </button>

        {submitError && (
          <p role="alert" className="mt-3 rounded-md border border-border bg-surface-alt p-3 text-sm text-danger">
            <span aria-hidden="true">! </span>{submitError}
          </p>
        )}
      </div>
    </form>
  );
}
