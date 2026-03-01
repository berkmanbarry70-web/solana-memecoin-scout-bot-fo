import { InlineKeyboard } from "grammy";
import { safeErr } from "../lib/safe.js";
import { getWatchlist, removeFromWatchlist, addToWatchlist } from "../stores/watchlists.js";
import { getTokenMetrics } from "../services/solanaData.js";
import { scoreToken } from "../services/scoring.js";

function fmtUsd(v) {
  if (v === null || v === undefined) return "n/a";
  const n = Number(v);
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

export function registerWatchlist(bot, { cfg, cache }) {
  bot.command("watchlist", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const wl = await getWatchlist(cfg, userId);
    const items = Array.isArray(wl.items) ? wl.items : [];

    if (items.length === 0) {
      return ctx.reply("Your watchlist is empty. Use Add to watchlist from /scan or /token.");
    }

    await ctx.reply("Your watchlist (" + items.length + "):");

    for (const it of items.slice(0, 25)) {
      const mint = String(it.mintAddress);
      const ckey = "token:" + mint;
      let m = cache?.get(ckey);
      if (!m) {
        m = await getTokenMetrics(mint);
        cache?.set(ckey, m, 30_000);
      }
      const s = scoreToken(m);

      const title = (m.symbol ? m.symbol + " " : "") + (m.name || "Token");
      const msg = [
        title,
        "Mint: " + mint,
        "Score: " + s.score + "  Liq: " + fmtUsd(m.liquidityUsd) + "  Vol24h: " + fmtUsd(m.volume24hUsd),
      ].join("\n");

      const kb = new InlineKeyboard()
        .text("Details", "token:show:" + mint)
        .text("Remove", "watch:remove:" + mint);

      await ctx.reply(msg, { reply_markup: kb, disable_web_page_preview: true });
    }

    if (items.length > 25) {
      await ctx.reply("Showing first 25 items.");
    }
  });

  bot.on("message:text", async (ctx, next) => {
    // Allow adding by replying with a mint address if the user is in watchlist context.
    // Minimal implementation: detect plain mint-like strings and offer quick add.
    const t = String(ctx.message?.text || "").trim();
    if (t.startsWith("/")) return next();

    if (t.length < 32 || t.length > 60) return next();
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return next();

    const userId = ctx.from?.id;
    if (!userId) return next();

    const kb = new InlineKeyboard().text("Add to watchlist", "watch:add:" + t);
    return ctx.reply("That looks like a mint address. Add it to your watchlist?", { reply_markup: kb });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("watch:remove:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const mint = String(data).split(":").pop();

    try {
      await removeFromWatchlist(cfg, userId, mint);
      await ctx.answerCallbackQuery("Removed");
      return ctx.reply("Removed from watchlist.");
    } catch (e) {
      console.warn("[watchlist] remove failed", { err: safeErr(e) });
      await ctx.answerCallbackQuery();
      return ctx.reply("Could not remove.");
    }
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("watch:add:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const mint = String(data).split(":").pop();

    const r = await addToWatchlist(cfg, userId, mint);
    await ctx.answerCallbackQuery();
    if (!r.ok) return ctx.reply("Could not add to watchlist. Set MONGODB_URI for persistence.");
    return ctx.reply("Added to watchlist.");
  });
}
