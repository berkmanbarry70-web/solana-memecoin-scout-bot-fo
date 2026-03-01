import { InlineKeyboard } from "grammy";
import { safeErr } from "../lib/safe.js";
import { aiChat } from "../lib/ai.js";
import { buildBotProfile } from "../lib/botProfile.js";
import { getTokenMetrics } from "../services/solanaData.js";
import { scoreToken } from "../services/scoring.js";
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from "../stores/watchlists.js";

function fmtUsd(v) {
  if (v === null || v === undefined) return "n/a";
  const n = Number(v);
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(6);
}

function fmtAge(m) {
  const mins = Number(m);
  if (!Number.isFinite(mins) || mins < 0) return "n/a";
  if (mins < 60) return Math.round(mins) + "m";
  const h = mins / 60;
  if (h < 24) return h.toFixed(1) + "h";
  const d = h / 24;
  return d.toFixed(1) + "d";
}

function linesForMetrics(m, score) {
  const flags = score.flags.length ? score.flags.join(", ") : "none";

  return [
    (m.symbol || m.name ? (m.symbol ? m.symbol + " " : "") + (m.name || "") : "Token") + " on Solana",
    "Mint: " + m.mintAddress,
    m.explorerUrl ? "Explorer: " + m.explorerUrl : "Explorer: n/a",
    m.dexUrl ? "DEX: " + m.dexUrl : "DEX: n/a",
    "",
    "Age: " + fmtAge(m.ageMinutes),
    "Price: " + fmtUsd(m.priceUsd),
    "Market cap: " + fmtUsd(m.marketCapUsd),
    "Liquidity: " + fmtUsd(m.liquidityUsd),
    "24h volume: " + fmtUsd(m.volume24hUsd),
    "Holders: " + (m.holderCount ?? "n/a"),
    "Top10 concentration: " + (m.top10HolderPct ?? "n/a") + (m.top10HolderPct !== null && m.top10HolderPct !== undefined ? "%" : ""),
    "Mint authority disabled: " + (m.mintAuthorityDisabled === null ? "n/a" : m.mintAuthorityDisabled ? "yes" : "no"),
    "Freeze authority disabled: " + (m.freezeAuthorityDisabled === null ? "n/a" : m.freezeAuthorityDisabled ? "yes" : "no"),
    "",
    "Score: " + score.score,
    "Flags: " + flags,
  ];
}

async function aiSummary(cfg, metrics) {
  const profile = buildBotProfile();

  const prompt = [
    "Write a short Token Summary (1-3 lines) and Risk Notes (1-3 lines).",
    "Be cautious and informational only.",
    "If fields are missing, say data unavailable.",
    "",
    "Token data (JSON):",
    JSON.stringify(
      {
        symbol: metrics.symbol,
        name: metrics.name,
        mintAddress: metrics.mintAddress,
        priceUsd: metrics.priceUsd,
        marketCapUsd: metrics.marketCapUsd,
        liquidityUsd: metrics.liquidityUsd,
        volume24hUsd: metrics.volume24hUsd,
        ageMinutes: metrics.ageMinutes,
        holderCount: metrics.holderCount,
        top10HolderPct: metrics.top10HolderPct,
        mintAuthorityDisabled: metrics.mintAuthorityDisabled,
        freezeAuthorityDisabled: metrics.freezeAuthorityDisabled,
      },
      null,
      0
    ),
  ].join("\n");

  const res = await aiChat(
    cfg,
    {
      messages: [
        { role: "system", content: profile },
        { role: "user", content: prompt },
      ],
      meta: { platform: "telegram", feature: "token_summary" },
    },
    { retries: cfg.AI_MAX_RETRIES }
  );

  if (!res.ok) return "Token Summary: (AI unavailable)\nRisk Notes: (AI unavailable)";

  const text = String(res.content || "").trim();
  return text || "Token Summary: (empty)\nRisk Notes: (empty)";
}

export function registerTokenView(bot, { cfg, cache }) {
  bot.command("token", async (ctx) => {
    const parts = String(ctx.message?.text || "").trim().split(/\s+/);
    const mintAddress = parts[1];
    if (!mintAddress) return ctx.reply("Usage: /token <mintAddress>");
    return showToken(ctx, { cfg, cache, mintAddress, via: "command" });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("token:show:")) return next();

    const mintAddress = String(data).split(":").pop();
    await ctx.answerCallbackQuery();
    return showToken(ctx, { cfg, cache, mintAddress, via: "button" });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("watch:toggle:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const mint = String(data).split(":").pop();

    const inWl = await isInWatchlist(cfg, userId, mint);
    if (inWl) await removeFromWatchlist(cfg, userId, mint);
    else await addToWatchlist(cfg, userId, mint);

    await ctx.answerCallbackQuery(inWl ? "Removed" : "Added");
    return showToken(ctx, { cfg, cache, mintAddress: mint, via: "button" });
  });
}

async function showToken(ctx, { cfg, cache, mintAddress }) {
  const userId = ctx.from?.id;

  try {
    const ckey = "token:" + mintAddress;
    let m = cache?.get(ckey);
    if (!m) {
      m = await getTokenMetrics(mintAddress);
      cache?.set(ckey, m, 30_000);
    }

    const s = scoreToken(m);

    const inWl = userId ? await isInWatchlist(cfg, userId, mintAddress) : false;
    const kb = new InlineKeyboard()
      .text(inWl ? "Remove watchlist" : "Add watchlist", "watch:toggle:" + mintAddress)
      .row()
      .text("Create alert", "alerts:create:" + mintAddress);

    const base = linesForMetrics(m, s).join("\n");

    let summary = "";
    try {
      summary = await aiSummary(cfg, m);
    } catch (e) {
      console.warn("[token] ai summary failed", { err: safeErr(e) });
      summary = "Token Summary: (AI error)\nRisk Notes: (AI error)";
    }

    const msg = base + "\n\n" + summary;

    // Works for both message context and callback context
    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(msg, { reply_markup: kb, disable_web_page_preview: true });
      } catch {
        return await ctx.reply(msg, { reply_markup: kb, disable_web_page_preview: true });
      }
    }

    return await ctx.reply(msg, { reply_markup: kb, disable_web_page_preview: true });
  } catch (e) {
    console.warn("[token] show failed", { err: safeErr(e) });
    return ctx.reply("Token data unavailable right now. Please try again later.");
  }
}
