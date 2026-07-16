"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutStaffAction } from "@/app/(office)/actions";

/**
 * Sign out. Since module 09 there is only one thing to tear down — the httpOnly
 * cookie — because the browser no longer holds any API credential. That is the
 * whole point of the Server Action refactor: nothing left in the page to leak,
 * and nothing left here to forget to clear.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await signOutStaffAction();
    } finally {
      // Navigate regardless: a sign-out that leaves someone signed in because
      // the network blipped is the wrong failure mode on a shared Ops desk.
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
