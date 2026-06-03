import app from "./app";
import { logger } from "./lib/logger";
import { initFlags } from "./lib/flags";
import { initAnnouncements } from "./lib/announcements";
import { initRejectionReasons } from "./lib/rejection-reasons";
import { initErrorLog } from "./lib/error-log";
import { initExamStore } from "./lib/exam-store";
import { initExamLimits } from "./lib/exam-limits";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bootstrap persistent stores from Supabase (graceful: falls back to
// in-memory defaults if tables have not been created yet).
Promise.all([
  initFlags(),
  initAnnouncements(),
  initRejectionReasons(),
  initErrorLog(),
  initExamStore(),
  initExamLimits(),
]).catch((err) => {
  logger.warn({ err }, "Persistent store bootstrap partial — using in-memory defaults");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
