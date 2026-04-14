import { type Express } from "express";
import { createServer as createViteServer, createLogger, build as viteBuild } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import path from "path";
import fs from "fs";
import express from "express";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  // ── Build admin app (once on startup, served statically) ─────────────────
  const adminDistPath = path.resolve(import.meta.dirname, "..", "dist", "admin");
  const adminConfigPath = path.resolve(
    import.meta.dirname,
    "..",
    "malebox-admin",
    "vite.config.ts",
  );

  if (!fs.existsSync(adminDistPath)) {
    console.log("[admin] Building admin app for dev server…");
    try {
      const adminRoot = path.resolve(import.meta.dirname, "..", "malebox-admin");
      await viteBuild({ configFile: adminConfigPath, root: adminRoot, logLevel: "warn" });
      console.log("[admin] Admin app built successfully.");
    } catch (e) {
      console.error("[admin] Admin build failed:", e);
    }
  }

  if (fs.existsSync(adminDistPath)) {
    app.use("/backstage", express.static(adminDistPath));
    app.use(/^\/backstage(\/.*)?$/, (_req, res) => {
      res.sendFile(path.resolve(adminDistPath, "index.html"));
    });
  }

  // ── Main client Vite instance ──────────────────────────────────────────────
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
