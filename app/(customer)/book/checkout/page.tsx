import type { Metadata } from "next";
import { CheckoutForm } from "@/components/customer/CheckoutForm";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">Checkout</h1>
      <p className="mt-1 mb-5 text-text-muted">
        Review your items and confirm. The price you see is the price you pay.
      </p>
      <CheckoutForm />
    </div>
  );
}
