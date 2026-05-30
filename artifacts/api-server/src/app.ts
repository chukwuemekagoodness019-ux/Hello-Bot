import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first proxy hop so req.ip resolves to the real client IP
// on hosting platforms (e.g. Render.com) that sit behind a reverse proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ---------------------------------------------------------------------------
// Frontend static file serving (production / Render deployment)
//
// In production the frontend is built into artifacts/study-system/dist/public.
// Express serves those files here so the app lives on a single Render Web
// Service rather than requiring two separate services.
//
// Request flow:
//  /api/*           → handled by the API router above (never reaches here)
//  /assets/main.js  → served directly from dist/public by express.static()
//  /quiz, /exam     → no static file found → SPA fallback serves index.html
//  /                → express.static() finds index.html → serves it
// ---------------------------------------------------------------------------
// __dirname is set by the esbuild banner to the directory containing index.mjs
// (i.e. artifacts/api-server/dist/).  From there, two levels up is the repo root,
// then into the study-system build output.  This path is stable on both Replit
// (cwd = artifact dir) and Render (cwd = repo root).
const frontendDist = path.resolve(__dirname, "..", "..", "study-system", "dist", "public");
const frontendIndex = path.join(frontendDist, "index.html");
const hasFrontend = fs.existsSync(frontendIndex);

if (hasFrontend) {
  app.use(express.static(frontendDist));

  // SPA history-API fallback: serve index.html for every non-API route so
  // that client-side routes like /quiz or /exam resolve correctly on a hard
  // refresh or direct URL visit.  We explicitly skip /api/* paths so that
  // unmatched API routes fall through to Express's default 404 handler
  // instead of silently returning the HTML page.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(frontendIndex);
  });
} else {
  logger.warn(
    { frontendDist },
    "Frontend dist not found — static file serving disabled. " +
    "Run `pnpm run build` from the repo root to produce the frontend bundle.",
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message, code: "INTERNAL" });
});

export default app;
