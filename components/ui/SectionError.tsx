"use client";

import { Button } from "./Button";

/**
 * SectionError — the error state every async section must define (PRD §11).
 * Never blank, always offers a retry. Message uses an icon + text (colour
 * only reinforces).
 */
export function SectionError({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-[10px] border border-border bg-surface-alt p-4"
    >
      <p className="text-text">
        <span aria-hidden="true" className="mr-2 font-bold text-danger">
          !
        </span>
        {message}
      </p>
      {onRetry && (
        <Button variant="ghost" size="customer" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
