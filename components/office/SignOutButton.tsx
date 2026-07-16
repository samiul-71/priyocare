"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearStaffTokens, readStaffRefreshToken } from "@/lib/shared/client-tokens";

/**
 * Sign out — tears down BOTH halves of the hybrid session (§10.2):
 * the httpOnly page cookie (dropped by the handler, since JS cannot touch it)
 * and the Bearer pair in localStorage (dropped here).
 *
 * The local half is cleared even if the request fails. A sign-out that leaves
 * credentials in the browser because the network blipped is the wrong failure
 * mode — on a shared Ops desk that is the whole point of the button.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const refreshToken = readStaffRefreshToken();
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Revokes the refresh token server-side; the handler needs no Bearer.
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    } catch {
      // Ignore — clearing local state below matters more than the round trip.
    } finally {
      clearStaffTokens();
      router.push("/office/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="w-full rounded-md px-3 py-2 text-left text-white/70 hover:bg-navy-800 hover:text-white disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
