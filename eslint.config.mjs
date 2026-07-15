import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/*
 * Module-boundary enforcement (PRD §4.2). The polyrepo used repo walls to make
 * cross-actor imports impossible; in one repo we recreate that with
 * eslint-plugin-boundaries as a BLOCKING check (same severity as typecheck):
 *   - (customer) may never import components/office or another group's code
 *   - lib/server is reachable only by the API and other server code
 *   - components/ui and lib/shared are importable by everyone
 *
 * Route-group folders contain literal parentheses, which micromatch reads as
 * extglob groups — hence the escaped `\\(...\\)` patterns.
 */
const boundariesConfig = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "boundaries/include": ["app/**/*", "components/**/*", "lib/**/*"],
    "boundaries/elements": [
      { type: "customer", pattern: ["app/\\(customer\\)/**", "components/customer/**"] },
      { type: "caregiver", pattern: ["app/\\(caregiver\\)/**", "components/caregiver/**"] },
      { type: "office", pattern: ["app/\\(office\\)/**", "components/office/**"] },
      { type: "api", pattern: ["app/api/**"] },
      { type: "ui", pattern: ["components/ui/**"] },
      { type: "shared", pattern: ["lib/shared/**"] },
      { type: "server", pattern: ["lib/server/**"] },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          { from: { element: { types: "customer" } }, allow: { to: { element: { types: { anyOf: ["customer", "ui", "shared"] } } } } },
          { from: { element: { types: "caregiver" } }, allow: { to: { element: { types: { anyOf: ["caregiver", "ui", "shared"] } } } } },
          { from: { element: { types: "office" } }, allow: { to: { element: { types: { anyOf: ["office", "ui", "shared"] } } } } },
          { from: { element: { types: "api" } }, allow: { to: { element: { types: { anyOf: ["api", "server", "shared"] } } } } },
          { from: { element: { types: "ui" } }, allow: { to: { element: { types: { anyOf: ["ui", "shared"] } } } } },
          { from: { element: { types: "shared" } }, allow: { to: { element: { types: "shared" } } } },
          { from: { element: { types: "server" } }, allow: { to: { element: { types: { anyOf: ["server", "shared"] } } } } },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  boundariesConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
