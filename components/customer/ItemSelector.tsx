"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  COLLECTION_FEE_BDT,
  computeBookingTotal,
  computeItemsSubtotal,
} from "@/lib/shared/pricing";

/**
 * Item selection for a visit booking (PRD §5). Pick tests/procedures, see the
 * running itemised total (same pricing helpers the server re-checks with), then
 * continue. The cart is handed to checkout via sessionStorage.
 */
export interface SelectableItem {
  variantId: number;
  nameBn: string;
  nameEn: string;
  priceBdt: number;
}

export interface CartItem extends SelectableItem {
  quantity: number;
}

export interface Cart {
  serviceSlug: string;
  serviceId: number;
  serviceName: string;
  items: CartItem[];
}

export function ItemSelector({
  serviceSlug,
  serviceId,
  serviceName,
  items,
}: {
  serviceSlug: string;
  serviceId: number;
  serviceName: string;
  items: SelectableItem[];
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<number, number>>({});

  const setQuantity = (variantId: number, next: number) =>
    setQty((q) => ({ ...q, [variantId]: Math.max(0, next) }));

  const selected: CartItem[] = items
    .map((it) => ({ ...it, quantity: qty[it.variantId] ?? 0 }))
    .filter((it) => it.quantity > 0);

  const subtotal = computeItemsSubtotal(selected);
  const total = computeBookingTotal(selected);

  function onContinue() {
    if (selected.length === 0) return;
    const cart: Cart = { serviceSlug, serviceId, serviceName, items: selected };
    window.sessionStorage.setItem("pc_cart", JSON.stringify(cart));
    router.push("/book/checkout");
  }

  return (
    <div>
      <ul>
        {items.map((it) => {
          const q = qty[it.variantId] ?? 0;
          return (
            <li key={it.variantId} className="flex items-center justify-between gap-4 border-b border-border py-3">
              <div>
                <span className="font-medium text-navy" lang="bn">{it.nameBn}</span>{" "}
                <span className="text-sm text-text-muted" lang="en">({it.nameEn})</span>
                <div className="tabular text-sm text-text-muted">{it.priceBdt.toLocaleString("en-US")} BDT</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${it.nameEn}`}
                  onClick={() => setQuantity(it.variantId, q - 1)}
                  className="h-11 w-11 rounded-md border border-border text-lg"
                >
                  −
                </button>
                <span className="tabular w-8 text-center" aria-live="polite">{q}</span>
                <button
                  type="button"
                  aria-label={`Add one ${it.nameEn}`}
                  onClick={() => setQuantity(it.variantId, q + 1)}
                  className="h-11 w-11 rounded-md border border-border text-lg"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-[10px] border border-border bg-surface-alt p-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="tabular">{subtotal.toLocaleString("en-US")} BDT</span>
        </div>
        <div className="flex justify-between text-sm text-text-muted">
          <span>Collection fee</span>
          <span className="tabular">{(selected.length ? COLLECTION_FEE_BDT : 0).toLocaleString("en-US")} BDT</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-navy">
          <span>Total</span>
          <span className="tabular">{total.toLocaleString("en-US")} BDT</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={selected.length === 0}
        className="mt-4 inline-flex min-h-11 items-center rounded-[10px] bg-navy px-6 font-medium text-white disabled:opacity-50"
      >
        Continue to checkout
      </button>
      {selected.length === 0 && (
        <p className="mt-2 text-sm text-text-muted">Add at least one item to continue.</p>
      )}
    </div>
  );
}
