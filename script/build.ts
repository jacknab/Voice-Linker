import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Temporary EISDIR debugger ─────────────────────────────────────────────────
// Wraps fs.promises.readFile so every file read is logged. When EISDIR hits we
// can see exactly which path triggered it.  Remove after the issue is resolved.
const _origRead = fs.promises.readFile.bind(fs.promises);
(fs.promises as any).readFile = async function debugRead(p: any, ...args: any[]) {
  const label = typeof p === "string" ? p : String(p);
  try {
    const result = await _origRead(p, ...args);
    return result;
  } catch (err: any) {
    if (err.code === "EISDIR") {
      console.error(`\n[EISDIR DEBUG] readFile was called on a DIRECTORY:\n  → ${label}\n`);
    }
    throw err;
  }
};
// ─────────────────────────────────────────────────────────────────────────────

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building admin...");
  const adminRoot = path.resolve(__dirname, "../malebox-admin");
  await viteBuild({
    configFile: path.resolve(adminRoot, "vite.config.ts"),
    root: adminRoot,
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
  // Note: ivr-default is bundled into main index.cjs to avoid ES module import issues
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
