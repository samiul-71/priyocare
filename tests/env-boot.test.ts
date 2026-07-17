import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/*
 * The BOOT WIRING for the env check — not the check itself (that is env.test.ts).
 *
 * WHY THIS FILE EXISTS: `env.test.ts` proves `findEnvProblems` returns the right
 * answer. That is worth nothing if the answer never reaches a running server. A
 * correct check that is never called is a check that does not exist, and nothing
 * in the unit suite would have noticed `instrumentation.ts` being deleted.
 *
 * It also caught a real bug. `register()` used to simply throw, on the
 * assumption that Next would fail the boot. The Next 16 docs never promise that,
 * and it is not what happens: Next catches the throw, logs an unhandledRejection
 * and KEEPS LISTENING. Measured, not assumed — the server stayed up past 90s and
 * served 500s on every route while printing "Refusing to start". Up-but-500ing is
 * not a loud failure: a supervisor sees a live process (no crash loop, no
 * restart) and a rolling deploy calls the new instance healthy and retires the
 * last good one. `register()` now exits explicitly.
 *
 * READ THIS BEFORE TRUSTING THE FAST TESTS: outside Next, `throw` and
 * `process.exit(1)` are INDISTINGUISHABLE — Node exits 1 on an unhandled
 * rejection either way (verified). So every test below passes against the broken
 * code too. They cover the file existing, the export name, the skip logic and the
 * message. The `next start` test at the bottom is the only thing standing
 * between this project and that bug coming back.
 */

const GOOD_SECRET = "a-secret-of-at-least-thirty-two-characters";

interface Run {
  code: number | null;
  output: string;
}

/** Kill a process AND its descendants. `SIGKILL` on the shell leaves the real
 *  server running on Windows; `taskkill /T` takes the tree. */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(-pid, "SIGKILL");
  }
}

/** Spawn, collect both streams, resolve on exit. Kills on timeout so a server
 *  that WRONGLY keeps running fails the test instead of hanging the suite. */
function run(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      // Windows needs a shell to resolve the `npx` shim.
      shell: true,
      // Own process group, so `killTree` can take the descendants with it.
      // Windows has no process groups; `taskkill /T` walks the tree instead.
      detached: process.platform !== "win32",
      env: { ...process.env, ...env },
    });

    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));

    const timer = setTimeout(() => {
      // `child.kill()` is NOT enough here. With `shell: true` the child is the
      // shell; the server is a grandchild, and killing the shell orphans it —
      // it keeps the port and poisons the next run with EADDRINUSE. Kill the
      // whole tree. (Seen for real: an orphan survived and the following run
      // exited non-zero for the wrong reason.)
      killTree(child.pid);
      // A sentinel, not the real code: killed means it never exited on its own,
      // which is the failure under test.
      resolve({ code: null, output });
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

/*
 * A fixture file, not a `-e` one-liner: package.json has no `"type": "module"`,
 * so tsx transpiles to CJS and `import('./instrumentation.ts')` resolves to
 * `{ default: exports }`. A test written that way tests tsx's module interop,
 * not this project.
 */
const PROBE = ["tsx", "--conditions=react-server", "tests/fixtures/boot-probe.ts"];

test("the boot hook runs the env check, and names the missing variable", async () => {
  const { code, output } = await run(
    "npx",
    PROBE,
    { NEXT_RUNTIME: "nodejs", JWT_SECRET: "" },
    45_000,
  );

  assert.notEqual(code, null, "the boot hook hung");
  assert.notEqual(code, 0, "a missing JWT_SECRET must not boot a server");
  // The message, not just the code. Any crash exits non-zero; only this one
  // names the variable, which is the point — the original bug was a deploy that
  // looked like an auth bug at 3am because nothing named the cause.
  assert.match(output, /JWT_SECRET/);
  assert.match(output, /Refusing to start/);
});

test("a short secret reads as short, with its length — not as missing", async () => {
  const { output } = await run(
    "npx",
    PROBE,
    { NEXT_RUNTIME: "nodejs", JWT_SECRET: "tooshort" },
    45_000,
  );
  // Naming the length is the difference between a fix and a guess.
  assert.match(output, /8 chars/);
});

test("a configured environment boots clean", async () => {
  // The discriminator for the tests above: without it, they could be passing on
  // some unrelated crash (a bad import, a typo) rather than the env check.
  const { code, output } = await run(
    "npx",
    PROBE,
    { NEXT_RUNTIME: "nodejs", JWT_SECRET: GOOD_SECRET },
    45_000,
  );
  assert.equal(code, 0, `a configured environment must boot. Got:\n${output}`);
  assert.doesNotMatch(output, /Refusing to start/);
});

test("the edge runtime is skipped — it signs nothing", async () => {
  const { code } = await run(
    "npx",
    PROBE,
    { NEXT_RUNTIME: "edge", JWT_SECRET: "" },
    45_000,
  );
  assert.equal(code, 0, "the edge runtime must not be gated on a signing secret");
});

test("the production build is skipped — it has no runtime secrets", async () => {
  // Build and deploy environments are routinely different: a Docker image is
  // built without production secrets, and should be. Failing the build here
  // would be wrong.
  const { code } = await run(
    "npx",
    PROBE,
    { NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", JWT_SECRET: "" },
    45_000,
  );
  assert.equal(code, 0, "`next build` must not need runtime secrets");
});

/*
 * THE LOAD-BEARING TEST. Everything above passes against the bug; this is the
 * only one that fails, because it is the only one that runs the hook the way
 * Next runs it. It needs a production build, so it skips loudly without one —
 * a skip is honest, a false pass is not.
 */
const hasBuild = existsSync(".next/BUILD_ID");

test(
  "next start does not stay up without JWT_SECRET",
  {
    skip: hasBuild ? false : "no production build — run `npm run build` first",
    timeout: 120_000,
  },
  async () => {
    // A random high port, not a fixed one: a stray server from an earlier run
    // would take a fixed port and this test would exit non-zero on EADDRINUSE —
    // right code, wrong reason. The message assertion below catches that too,
    // but not colliding in the first place is better than failing loudly.
    const port = 3900 + Math.floor(Math.random() * 80);
    const { code, output } = await run(
      "npx",
      ["next", "start", "-p", String(port)],
      { JWT_SECRET: "" },
      90_000,
    );

    // `code === null` means the timeout killed it — the server was still
    // running, which IS the bug: it printed "Refusing to start" and then served
    // 500s indefinitely.
    assert.notEqual(code, null, "the server never exited — it stayed up serving 500s");
    assert.notEqual(code, 0, "a server with no signing secret must not stay up");

    // Without this, a missing build would also exit non-zero and this test would
    // pass while proving nothing at all.
    assert.match(output, /JWT_SECRET/, "exited, but not for the reason under test");
    assert.match(output, /Refusing to start/);
  },
);
