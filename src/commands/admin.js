import { InlineKeyboard } from "grammy";
import { safeErr, sleep } from "../lib/safe.js";
import { listAllUsers } from "../stores/users.js";

function parseAdminIds(cfg) {
  const raw = String(cfg.ADMIN_TELEGRAM_USER_IDS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => String(Number(s)))
    .filter((s) => s && s !== "NaN");
}

function isAdmin(cfg, userId) {
  const ids = parseAdminIds(cfg);
  if (!ids.length) return { ok: false, configured: false };
  return { ok: ids.includes(String(userId)), configured: true };
}

export default function register(bot) {
  bot.command("admin", async (ctx) => {
    const userId = ctx.from?.id;
    const a = isAdmin(bot.cfg, userId);
    if (!a.configured) return ctx.reply("Admin not configured.");
    if (!a.ok) return ctx.reply("Not authorized.");

    const kb = new InlineKeyboard()
      .text("Health", "admin:health")
      .row()
      .text("Refresh cache", "admin:cache")
      .row()
      .text("Broadcast", "admin:broadcast");

    return ctx.reply("Admin controls:", { reply_markup: kb });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("admin:")) return next();

    const userId = ctx.from?.id;
    const a = isAdmin(bot.cfg, userId);
    if (!a.configured) {
      await ctx.answerCallbackQuery();
      return ctx.reply("Admin not configured.");
    }
    if (!a.ok) {
      await ctx.answerCallbackQuery();
      return ctx.reply("Not authorized.");
    }

    if (data === "admin:health") {
      await ctx.answerCallbackQuery();
      const up = Math.round(process.uptime());
      const msg = [
        "Uptime seconds: " + up,
        "DB configured: " + (!!bot.cfg.MONGODB_URI),
        "Alerts loop running: " + (!!bot._alertsLoopRunning),
      ].join("\n");
      return ctx.reply(msg);
    }

    if (data === "admin:cache") {
      await ctx.answerCallbackQuery();
      try {
        bot._globalCache?.clear?.();
      } catch {}
      return ctx.reply("Cache cleared.");
    }

    if (data === "admin:broadcast") {
      await ctx.answerCallbackQuery();
      bot._adminBroadcastPending = { userId, step: "text" };
      return ctx.reply("Send the broadcast message text.");
    }
  });

  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    const pending = bot._adminBroadcastPending;
    if (!pending || pending.userId !== userId) return next();

    const a = isAdmin(bot.cfg, userId);
    if (!a.configured || !a.ok) {
      bot._adminBroadcastPending = null;
      return next();
    }

    const text = String(ctx.message?.text || "").trim();
    if (!text || text.startsWith("/")) return ctx.reply("Please send the broadcast message as plain text.");

    bot._adminBroadcastPending = null;

    const users = await listAllUsers(bot.cfg);
    if (!users.length) return ctx.reply("No users found.");

    await ctx.reply("Broadcasting to " + users.length + " users…");

    let ok = 0;
    let fail = 0;

    for (const u of users) {
      const id = Number(u.telegramUserId);
      if (!Number.isFinite(id)) continue;

      try {
        await bot.api.sendMessage(id, text);
        ok++;
      } catch (e) {
        fail++;
        console.warn("[admin] broadcast send failed", { userId: id, err: safeErr(e) });
      }

      // basic rate limit
      await sleep(35);
    }

    return ctx.reply("Broadcast done. Sent: " + ok + ". Failed: " + fail + ".");
  });
}
