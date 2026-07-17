/*
 * Calls the real boot hook in a throwaway process, so `env-boot.test.ts` can
 * assert on its exit code — `register()` exits, which would take the test
 * runner with it if called in-process.
 *
 * A file, not a `-e` one-liner: package.json has no `"type": "module"`, so tsx
 * transpiles to CJS and `import('./instrumentation.ts')` resolves to
 * `{ default: exports }` — the export shows up as `m.default.register`, not
 * `m.register`. A test that tripped over that would be testing tsx's module
 * interop rather than this project's boot wiring.
 */
import { register } from "../../instrumentation.ts";

register();
