import { InlineKeyboard } from "grammy";
import { safeErr } from "../lib/safe.js";
import { getWatchlist } from "../stores/watchlists.js";
import { createAlert, listAlertsByUser } from "../stores/alerts.js";

const pending = new Map();

function key(userId) {
  return String(userId || "");
}

function kbTypes(mint) {
  return new InlineKeyboard()
    .text("Price change %", "alerts:type:price:" + mint)
    .row()
    .text("Liquidity drop %", "alerts:type:liq:" + mint)
    .row()
    .text("Volume spike %", "alerts:type:vol:" + mint)
    .row()
    .text("Cancel", "alerts:cancel");
}

export function registerAlertsFlow(bot, { cfg }) {
  bot.command("alerts", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const alerts = await listAlertsByUser(cfg, userId);
    if (!alerts.length) {
      return ctx.reply("No alerts yet. Open a token and tap Create alert, or type /alerts then pick a watchlist token.");
    }

    const msg = alerts
      .slice(0, 30)
      .map((a, i) => {
        return (
          (i + 1) + ") " +
          a.type +
          " for " +
          a.mintAddress +
          " (" +
          (a.enabled ? "enabled" : "disabled") +
          ")"
        );
      })
      .join("\n");

    return ctx.reply("Your alerts:\n" + msg);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("alerts:create:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const mint = String(data).split(":").pop();

    await ctx.answerCallbackQuery();
    return ctx.reply(
      "Choose alert type for\n" + mint,
      { reply_markup: kbTypes(mint) }
    );
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (data !== "alerts:cancel") return next();
    const userId = ctx.from?.id;
    if (userId) pending.delete(key(userId));
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText("Alert creation canceled.");
    } catch {
      await ctx.reply("Alert creation canceled.");
    }
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("alerts:type:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const parts = String(data).split(":");
    const kind = parts[2];
    const mint = parts.slice(3).join(":");

    // Basic watchlist guard
    const wl = await getWatchlist(cfg, userId);
    const inWl = Array.isArray(wl.items) && wl.items.some((x) => x?.mintAddress === mint);
    if (!inWl) {
      await ctx.answerCallbackQuery();
      return ctx.reply("Add this token to your watchlist first.");
    }

    pending.set(key(userId), {
      mint,
      kind,
      step: "threshold",
    });

    await ctx.answerCallbackQuery();
    return ctx.reply(
      "Send the threshold as a number (percent). Example: 20\n\nType: " +
        (kind === "price" ? "Price change" : kind === "liq" ? "Liquidity drop" : "Volume spike")
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const p = pending.get(key(userId));
    if (!p) return next();

    const t = String(ctx.message?.text || "").trim();
    if (t.startsWith("/")) return next();

    const threshold = Number(t);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 10_000) {
      return ctx.reply("Please send a valid percent number, like 20.");
    }

    const type =
      p.kind === "price"
        ? "price_change_pct"
        : p.kind === "liq"
          ? "liquidity_drop_pct"
          : "volume_spike_pct";

    try {
      const r = await createAlert(cfg, {
        telegramUserId: userId,
        mintAddress: p.mint,
        type,
        enabled: true,
        params: { thresholdPct: threshold, window: "1h" },
        checkEverySeconds: cfg.ALERTS_POLL_INTERVAL_SECONDS,
      });

      pending.delete(key(userId));

      if (!r.ok) return ctx.reply("Could not save alert. Set MONGODB_URI for persistence.");

      return ctx.reply("Alert created. Note: alert triggering logic is minimal until a real data provider is configured.");
    } catch (e) {
      console.warn("[alerts] create failed", { err: safeErr(e) });
      pending.delete(key(userId));
      return ctx.reply("Could not create alert right now.");
    }
  });
}
