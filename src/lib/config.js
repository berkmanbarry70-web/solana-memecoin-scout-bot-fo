import { clampNumber } from "./safe.js";

export const cfg = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,

  MONGODB_URI: process.env.MONGODB_URI || "",

  COOKMYBOTS_AI_ENDPOINT: process.env.COOKMYBOTS_AI_ENDPOINT || "",
  COOKMYBOTS_AI_KEY: process.env.COOKMYBOTS_AI_KEY || "",

  AI_DEBUG: String(process.env.AI_DEBUG || "0") === "1",
  AI_TIMEOUT_MS: clampNumber(process.env.AI_TIMEOUT_MS, {
    min: 1_000,
    max: 1_800_000,
    fallback: 600_000,
  }),
  AI_MAX_RETRIES: clampNumber(process.env.AI_MAX_RETRIES, {
    min: 0,
    max: 5,
    fallback: 2,
  }),
  AI_MODEL: process.env.AI_MODEL || "",

  SCAN_COOLDOWN_SECONDS: clampNumber(process.env.SCAN_COOLDOWN_SECONDS, {
    min: 0,
    max: 3600,
    fallback: 60,
  }),

  ALERTS_POLL_INTERVAL_SECONDS: clampNumber(
    process.env.ALERTS_POLL_INTERVAL_SECONDS,
    { min: 10, max: 3600, fallback: 60 }
  ),

  ADMIN_TELEGRAM_USER_IDS: process.env.ADMIN_TELEGRAM_USER_IDS || "",

  NODE_ENV: process.env.NODE_ENV || "development",
};
