import "dotenv/config";

import { run } from "@grammyjs/runner";

import { cfg } from "./lib/config.js";
import { safeErr, sleep } from "./lib/safe.js";
import { createBot } from "./bot.js";
import { registerCommands } from "./commands/loader.js";
import { createTtlCache } from "./services/cache.js";
import { startAlertsLoop } from "./services/alertsEngine.js";

process.on("unhandledRejection", (r) => {
  console.error("UnhandledRejection:", safeErr(r));
  process.exit(1);
});
process.on("uncaughtException", (e) => {
  console.error("UncaughtException:", safeErr(e));
  process.exit(1);
});

async function boot() {
  console.log("[boot] start", {
    nodeEnv: cfg.NODE_ENV,
    TELEGRAM_BOT_TOKEN_set: !!cfg.TELEGRAM_BOT_TOKEN,
    MONGODB_URI_set: !!cfg.MONGODB_URI,
    COOKMYBOTS_AI_ENDPOINT_set: !!cfg.COOKMYBOTS_AI_ENDPOINT,
    COOKMYBOTS_AI_KEY_set: !!cfg.COOKMYBOTS_AI_KEY,
  });

  if (!cfg.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is required. Set it in the environment and redeploy.");
    process.exit(1);
  }

  const bot = createBot(cfg.TELEGRAM_BOT_TOKEN);

  // Global cache handle for admin refresh
  const globalCache = createTtlCache({ max: 3000 });
  bot._globalCache = globalCache;

  // Init bot info early so ctx.me works
  try {
    await bot.init();
  } catch (e) {
    console.warn("[boot] bot.init failed", { err: safeErr(e) });
  }

  await registerCommands(bot);

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Welcome and main actions" },
      { command: "help", description: "How to use the bot" },
      { command: "scan", description: "Scan recent tokens" },
      { command: "token", description: "Token details by mint address" },
      { command: "watchlist", description: "View your watchlist" },
      { command: "alerts", description: "Manage alerts" },
      { command: "admin", description: "Admin tools" },
      { command: "reset", description: "Clear AI memory" },
    ]);
  } catch (e) {
    console.warn("[boot] setMyCommands failed", { err: safeErr(e) });
  }

  // Alerts loop
  let alertsRunning = false;
  bot._alertsLoopRunning = false;
  startAlertsLoop({
    bot,
    cfg,
    cache: globalCache,
    setRunningFlag(v) {
      alertsRunning = !!v;
      bot._alertsLoopRunning = !!v;
    },
  });

  // Polling with runner, with deleteWebhook and 409 backoff safety
  console.log("[boot] polling start");

  let backoffMs = 2000;
  while (true) {
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: true });

      const runner = run(bot, {
        concurrency: 1,
      });

      await runner.task();

      // runner.task() resolves only when stopped; restart loop
      console.warn("[boot] runner stopped; restarting", { backoffMs });
    } catch (e) {
      const msg = safeErr(e);
      console.warn("[boot] polling error", { err: msg });

      if (String(msg).includes("409") || String(msg).toLowerCase().includes("conflict")) {
        console.warn("[boot] getUpdates conflict; backing off", { backoffMs });
      }
    }

    await sleep(backoffMs);
    backoffMs = Math.min(20_000, Math.round(backoffMs * 1.7));
  }
}

boot().catch((e) => {
  console.error("[boot] fatal", { err: safeErr(e) });
  process.exit(1);
});
