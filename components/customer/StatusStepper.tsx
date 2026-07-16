import type { Step } from "@/lib/shared/tracking";

/**
 * Status stepper (PRD §11, AC 7.3). State is conveyed by icon + label + an
 * explicit "Done/In progress/Upcoming" screen-reader phrase — never colour
 * alone — so it reads correctly in greyscale and to assistive tech.
 */
export function StatusStepper({
  steps,
  currentIndex,
}: {
  steps: Step[];
  currentIndex: number;
}) {
  return (
    <ol className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const state = done ? "Done" : current ? "In progress" : "Upcoming";
        return (
          <li
            key={step.key}
            className="flex items-start gap-3 pb-4 last:pb-0"
            aria-current={current ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                done
                  ? "border-teal-900 bg-teal-900 text-white"
                  : current
                    ? "border-teal-900 text-teal-900"
                    : "border-border text-text-muted"
              }`}
            >
              {done || current ? step.glyph : i + 1}
            </span>
            <span className="pt-1">
              <span className={`font-medium ${current || done ? "text-navy" : "text-text-muted"}`}>
                {step.label}
              </span>
              <span className="sr-only"> — {state}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
