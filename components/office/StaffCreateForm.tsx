"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStaffAction } from "@/app/(office)/actions";

/**
 * Create an office account from the panel (§10.1) — the in-panel twin of
 * `npm run db:create-staff`. Admin-only; the action refuses `ops` regardless of
 * this form being rendered.
 *
 * No password box: the server generates a handover password and returns it once,
 * exactly like an admin reset. An admin typing a colleague's first password is
 * the "Welcome123" failure the generated credential avoids.
 */
export function StaffCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    try {
      const res = await createStaffAction({
        name: name || undefined,
        email: form.get("email"),
        role: form.get("role"),
      });
      if (res.ok) {
        setCreated(res.data);
        router.refresh();
        return;
      }
      setError(res.error);
      if (res.fields) setFieldErrors(res.fields);
    } catch {
      setError("Network error — please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div role="status" className="mb-6 max-w-md rounded-md border border-navy bg-navy-50 p-4">
        <p className="text-sm font-medium text-navy">Account created for {created.email}.</p>
        <p className="mt-2 text-xs text-navy">Read this password to them now — it is shown once:</p>
        <p className="my-1 font-mono text-base font-bold tracking-wider text-navy">{created.password}</p>
        <p className="text-xs text-text-muted">
          They must change it at their first sign-in. It is not stored anywhere readable.
        </p>
        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setOpen(false);
          }}
          className="mt-3 min-h-8 rounded-md border border-border px-3 text-xs font-medium text-navy"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white"
      >
        Add staff account
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 max-w-md rounded-md border border-border bg-surface-alt p-4">
      <h2 className="mb-3 font-medium text-navy">New office account</h2>

      <label className="block text-xs font-medium text-navy" htmlFor="staff-name">
        Name <span className="text-text-muted">(optional — defaults to the email name)</span>
      </label>
      <input
        id="staff-name"
        name="name"
        type="text"
        maxLength={120}
        className="mt-1 mb-3 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />

      <label className="block text-xs font-medium text-navy" htmlFor="staff-email">
        Email
      </label>
      <input
        id="staff-email"
        name="email"
        type="email"
        required
        aria-invalid={fieldErrors.email ? true : undefined}
        className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />
      {fieldErrors.email && (
        <p role="alert" className="mt-1 mb-2 text-xs text-danger">
          {fieldErrors.email.join(" ")}
        </p>
      )}

      <label className="mt-3 block text-xs font-medium text-navy" htmlFor="staff-role">
        Role
      </label>
      <select
        id="staff-role"
        name="role"
        defaultValue="ops"
        className="mt-1 mb-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      >
        <option value="ops">Ops — case work, no account admin</option>
        <option value="admin">Admin — full access, incl. staff and lead rota</option>
      </select>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-9 rounded-md bg-navy px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="min-h-9 rounded-md border border-border px-4 text-sm font-medium text-navy disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
