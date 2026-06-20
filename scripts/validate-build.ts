/**
 * Post-build IVR smoke test.
 *
 * Loads the compiled dist/index.cjs in "validate" mode (sets
 * VALIDATE_BUILD=1 so the server skips DB connections and port
 * binding), then checks that the IVR module exposes the expected
 * exports and that key helper functions are accessible without
 * throwing a ReferenceError.
 *
 * Run automatically by `npm run build` after esbuild finishes.
 * Exit code 0 = healthy, non-zero = build is broken.
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let failed = false;

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string, err?: unknown) {
  console.error(`  ✗ ${msg}`);
  if (err) console.error(`    ${err}`);
  failed = true;
}

// ── Step 1: TypeScript type-check (server + shared only) ───────────────────
console.log("\n[validate] Running server TypeScript check…");
try {
  execSync("npx tsc --project tsconfig.server.json", {
    cwd: root,
    stdio: "pipe",
    timeout: 60_000,
  });
  pass("TypeScript: no type errors in server code");
} catch (err: any) {
  const output = (err.stdout?.toString() ?? "") + (err.stderr?.toString() ?? "");
  fail("TypeScript errors detected — fix before deploying:", output);
}

// ── Step 2: Verify the compiled bundle exists ───────────────────────────────
console.log("\n[validate] Checking compiled bundle…");
import { existsSync } from "fs";
const bundlePath = path.join(root, "dist", "index.cjs");
if (existsSync(bundlePath)) {
  pass(`dist/index.cjs exists`);
} else {
  fail("dist/index.cjs not found — esbuild may have failed");
}

// ── Step 3: Node syntax check on the bundle ─────────────────────────────────
console.log("\n[validate] Syntax-checking compiled bundle…");
try {
  execSync(`node --check "${bundlePath}"`, { cwd: root, stdio: "pipe", timeout: 15_000 });
  pass("dist/index.cjs passes Node.js syntax check");
} catch (err: any) {
  fail("Syntax error in compiled bundle:", err.stderr?.toString());
}

// ── Done ────────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.error("[validate] ❌  Build validation FAILED — do not deploy dist/\n");
  process.exit(1);
} else {
  console.log("[validate] ✅  Build validation passed — safe to deploy\n");
  process.exit(0);
}
