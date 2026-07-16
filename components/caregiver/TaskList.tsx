"use client";

import { useState } from "react";
import { makeEvent } from "@/lib/shared/caregiver-events";
import { enqueue } from "@/lib/caregiver/queue";
import { flushQueue } from "@/lib/caregiver/sync";

/**
 * The task ticklist (§5, AC-4.1).
 *
 * Each tick queues immediately and locally — no token, no network, no waiting
 * (AC-4.1: "access expired, offline → tick queues, no login prompt"). The
 * checkbox flips the instant she taps it because the tap IS the record; the
 * server hears about it whenever the radio allows.
 *
 * The whole tick set is sent each time rather than a delta: after a day offline
 * the device's set is the truth, and replaying deltas out of order would
 * corrupt it.
 */
export function TaskList({
  bookingId,
  tasks,
  initialDone,
}: {
  bookingId: number;
  tasks: string[];
  initialDone: string[];
}) {
  const [done, setDone] = useState<Set<string>>(new Set(initialDone));

  async function toggle(task: string) {
    const next = new Set(done);
    if (next.has(task)) next.delete(task);
    else next.add(task);
    setDone(next); // optimistic by design — the device is the source of truth

    await enqueue(makeEvent("task_tick", bookingId, { tasks: [...next] }));
    void flushQueue();
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-5 text-base text-text-muted">
        এই কাজের জন্য কোনো তালিকা নেই।
        <span className="mt-1 block text-sm">No checklist for this service.</span>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => {
        const checked = done.has(task);
        return (
          <li key={task}>
            {/* The whole row is the target — 56px, thumb-sized, sunlight-legible. */}
            <label
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 text-lg ${
                checked ? "border-teal-800 bg-teal-50" : "border-border bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(task)}
                className="h-6 w-6 shrink-0 accent-teal-800"
              />
              {/* Icon + strike, never colour alone (design.md §5.1). */}
              <span className={checked ? "text-teal-900 line-through" : "text-navy"}>{task}</span>
              {checked && <span aria-hidden="true" className="ml-auto text-teal-900">✓</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
