import { InlineKeyboard } from "grammy";
import { safeErr } from "../lib/safe.js";
import { scanTokenCandidates } from "../services/solanaData.js";
import { scoreToken } from "../services/scoring.js";
import { addToWatchlist } from "../stores/watchlists.js";
import { updateUserLastScanAt } from "../stores/users.js";

const scanState = new Map();

function defaults() {
  return {
    timeframe: "6h",
    minLiquidityUsd: 25_000,
    minVolume24hUsd: 50_000,
    mcapMinUsd: null,
    mcapMaxUsd: null,
    maxAgeMinutes: null,
    limit: 5,
    risk: {
      requireMintDisabled: true,
      requireFreezeDisabled: true,
      excludeExtremelyNew: true,
      extremelyNewMinutes: 10,
      excludeHighTop10: true,
      top10MaxPct: 65,
      excludeLowHolders: true,
      holdersMin: 100,
    },
  };
}

function stateKey(userId) {
  return String(userId || "");
}

function fmtUsd(v) {
  if (v === null || v === undefined) return "n/a";
  const n = Number(v);
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
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

function renderSummary(s) {
  const r = s.risk;
  return [
    "Timeframe: " + s.timeframe,
    "Min liquidity: " + fmtUsd(s.minLiquidityUsd),
    "Min 24h volume: " + fmtUsd(s.minVolume24hUsd),
    "Market cap: " + (s.mcapMinUsd ? fmtUsd(s.mcapMinUsd) : "any") + " to " + (s.mcapMaxUsd ? fmtUsd(s.mcapMaxUsd) : "any"),
    "Max age: " + (s.maxAgeMinutes ? fmtAge(s.maxAgeMinutes) : "any"),
    "Results: top " + s.limit,
    "",
    "Risk toggles:",
    "Mint disabled required: " + (r.requireMintDisabled ? "on" : "off"),
    "Freeze disabled required: " + (r.requireFreezeDisabled ? "on" : "off"),
    "Exclude very new (<" + r.extremelyNewMinutes + "m): " + (r.excludeExtremelyNew ? "on" : "off"),
    "Exclude high top10 (>" + r.top10MaxPct + "%): " + (r.excludeHighTop10 ? "on" : "off"),
    "Exclude low holders (<" + r.holdersMin + "): " + (r.excludeLowHolders ? "on" : "off"),
  ].join("\n");
}

function kbMain(s) {
  const kb = new InlineKeyboard()
    .text("Timeframe: " + s.timeframe, "scan:set:timeframe")
    .row()
    .text("Min liq", "scan:set:minliq")
    .text("Min vol", "scan:set:minvol")
    .row()
    .text("Market cap", "scan:set:mcap")
    .text("Max age", "scan:set:maxage")
    .row()
    .text("Risk toggles", "scan:set:risk")
    .text("Limit: " + s.limit, "scan:set:limit")
    .row()
    .text("Run scan", "scan:run")
    .text("Cancel", "scan:cancel");
  return kb;
}

function kbTimeframe() {
  return new InlineKeyboard()
    .text("1h", "scan:time:1h")
    .text("6h", "scan:time:6h")
    .text("24h", "scan:time:24h")
    .row()
    .text("Back", "scan:back");
}

function kbRisk(s) {
  const r = s.risk;
  function tog(label, on, cb) {
    return (on ? "On: " : "Off: ") + label;
  }
  return new InlineKeyboard()
    .text(tog("Mint disabled", r.requireMintDisabled), "scan:risk:mint")
    .row()
    .text(tog("Freeze disabled", r.requireFreezeDisabled), "scan:risk:freeze")
    .row()
    .text(tog("Exclude <" + r.extremelyNewMinutes + "m", r.excludeExtremelyNew), "scan:risk:new")
    .row()
    .text(tog("Exclude top10>" + r.top10MaxPct + "%", r.excludeHighTop10), "scan:risk:top10")
    .row()
    .text(tog("Exclude holders<" + r.holdersMin, r.excludeLowHolders), "scan:risk:holders")
    .row()
    .text("Back", "scan:back");
}

export function registerScanFlow(bot, { cfg, rateLimiter, cache }) {
  bot.command("scan", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const cool = rateLimiter.canRun({
      userId,
      action: "scan",
      cooldownSeconds: cfg.SCAN_COOLDOWN_SECONDS,
    });

    if (!cool.ok) {
      return ctx.reply("Scan cooldown. Try again in about " + cool.waitSeconds + "s.");
    }

    scanState.set(stateKey(userId), { step: "main", ...defaults() });

    await ctx.reply(
      "Scan setup. Choose filters, then run.",
      { reply_markup: kbMain(scanState.get(stateKey(userId))) }
    );
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data || "";
    if (!String(data).startsWith("scan:")) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    const st = scanState.get(stateKey(userId));
    if (!st) {
      await ctx.answerCallbackQuery();
      return ctx.reply("No active scan. Type /scan to start again.");
    }

    try {
      if (data === "scan:cancel") {
        scanState.delete(stateKey(userId));
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Scan canceled.");
      }

      if (data === "scan:back") {
        st.step = "main";
        scanState.set(stateKey(userId), st);
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Scan setup.", { reply_markup: kbMain(st) });
      }

      if (data === "scan:set:timeframe") {
        st.step = "timeframe";
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Choose timeframe.", { reply_markup: kbTimeframe() });
      }

      if (data.startsWith("scan:time:")) {
        st.timeframe = data.split(":").pop();
        st.step = "main";
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Updated timeframe.\n\n" + renderSummary(st), { reply_markup: kbMain(st) });
      }

      if (data === "scan:set:risk") {
        st.step = "risk";
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Risk toggles.", { reply_markup: kbRisk(st) });
      }

      if (data === "scan:risk:mint") {
        st.risk.requireMintDisabled = !st.risk.requireMintDisabled;
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbRisk(st) });
      }

      if (data === "scan:risk:freeze") {
        st.risk.requireFreezeDisabled = !st.risk.requireFreezeDisabled;
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbRisk(st) });
      }

      if (data === "scan:risk:new") {
        st.risk.excludeExtremelyNew = !st.risk.excludeExtremelyNew;
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbRisk(st) });
      }

      if (data === "scan:risk:top10") {
        st.risk.excludeHighTop10 = !st.risk.excludeHighTop10;
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbRisk(st) });
      }

      if (data === "scan:risk:holders") {
        st.risk.excludeLowHolders = !st.risk.excludeLowHolders;
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbRisk(st) });
      }

      if (data === "scan:set:limit") {
        st.limit = st.limit === 5 ? 10 : st.limit === 10 ? 3 : 5;
        await ctx.answerCallbackQuery("Limit set to " + st.limit);
        return ctx.editMessageReplyMarkup({ reply_markup: kbMain(st) });
      }

      if (data === "scan:set:minliq") {
        st.minLiquidityUsd = st.minLiquidityUsd === 25_000 ? 100_000 : st.minLiquidityUsd === 100_000 ? 10_000 : 25_000;
        await ctx.answerCallbackQuery("Min liq " + st.minLiquidityUsd);
        return ctx.editMessageReplyMarkup({ reply_markup: kbMain(st) });
      }

      if (data === "scan:set:minvol") {
        st.minVolume24hUsd = st.minVolume24hUsd === 50_000 ? 250_000 : st.minVolume24hUsd === 250_000 ? 10_000 : 50_000;
        await ctx.answerCallbackQuery("Min vol " + st.minVolume24hUsd);
        return ctx.editMessageReplyMarkup({ reply_markup: kbMain(st) });
      }

      if (data === "scan:set:mcap") {
        // Quick toggle: none -> 1M..100M -> none
        if (!st.mcapMinUsd && !st.mcapMaxUsd) {
          st.mcapMinUsd = 1_000_000;
          st.mcapMaxUsd = 100_000_000;
        } else {
          st.mcapMinUsd = null;
          st.mcapMaxUsd = null;
        }
        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbMain(st) });
      }

      if (data === "scan:set:maxage") {
        // Quick toggle: any -> 6h -> 24h -> any
        if (!st.maxAgeMinutes) st.maxAgeMinutes = 6 * 60;
        else if (st.maxAgeMinutes === 6 * 60) st.maxAgeMinutes = 24 * 60;
        else st.maxAgeMinutes = null;

        await ctx.answerCallbackQuery();
        return ctx.editMessageReplyMarkup({ reply_markup: kbMain(st) });
      }

      if (data === "scan:run") {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Running scan…");

        await updateUserLastScanAt(cfg, userId, new Date());

        const cacheKey = "scan:" + JSON.stringify({
          t: st.timeframe,
          l: st.minLiquidityUsd,
          v: st.minVolume24hUsd,
          lim: st.limit,
          r: st.risk,
          m1: st.mcapMinUsd,
          m2: st.mcapMaxUsd,
          a: st.maxAgeMinutes,
        });

        let candidates = cache?.get(cacheKey);
        if (!candidates) {
          candidates = await scanTokenCandidates(st);
          cache?.set(cacheKey, candidates, 30_000);
        }

        // Apply filters we can enforce on normalized fields.
        const filtered = (candidates || []).filter((c) => {
          if (c.liquidityUsd !== null && c.liquidityUsd < st.minLiquidityUsd) return false;
          if (c.volume24hUsd !== null && c.volume24hUsd < st.minVolume24hUsd) return false;
          if (st.maxAgeMinutes && c.ageMinutes !== null && c.ageMinutes > st.maxAgeMinutes) return false;

          if (st.mcapMinUsd && c.marketCapUsd !== null && c.marketCapUsd < st.mcapMinUsd) return false;
          if (st.mcapMaxUsd && c.marketCapUsd !== null && c.marketCapUsd > st.mcapMaxUsd) return false;

          if (st.risk.requireMintDisabled && c.mintAuthorityDisabled === false) return false;
          if (st.risk.requireFreezeDisabled && c.freezeAuthorityDisabled === false) return false;

          if (st.risk.excludeExtremelyNew && c.ageMinutes !== null && c.ageMinutes < st.risk.extremelyNewMinutes) return false;
          if (st.risk.excludeHighTop10 && c.top10HolderPct !== null && c.top10HolderPct > st.risk.top10MaxPct) return false;
          if (st.risk.excludeLowHolders && c.holderCount !== null && c.holderCount < st.risk.holdersMin) return false;

          return true;
        });

        const ranked = filtered
          .map((c) => {
            const s = scoreToken(c);
            return { c, s };
          })
          .sort((a, b) => b.s.score - a.s.score)
          .slice(0, st.limit);

        if (ranked.length === 0) {
          return ctx.reply("No matches for those filters. Try lowering min liquidity/volume or relaxing risk toggles.");
        }

        for (let i = 0; i < ranked.length; i++) {
          const { c, s } = ranked[i];
          const title = (c.symbol ? c.symbol + " " : "") + (c.name || "Token");
          const line = [
            (i + 1) + ") " + title,
            "Age: " + fmtAge(c.ageMinutes) + "  Liq: " + fmtUsd(c.liquidityUsd) + "  Vol24h: " + fmtUsd(c.volume24hUsd),
            "Score: " + s.score + (s.flags.length ? "  Flags: " + s.flags.join(", ") : ""),
            "Mint: " + c.mintAddress,
          ].join("\n");

          const kb = new InlineKeyboard()
            .text("Details", "token:show:" + c.mintAddress)
            .text("Add to watchlist", "watch:add:" + c.mintAddress);

          await ctx.reply(line, { reply_markup: kb });
        }

        scanState.delete(stateKey(userId));
        return;
      }

      await ctx.answerCallbackQuery();
      return;
    } catch (e) {
      console.warn("[scan] callback failed", { err: safeErr(e) });
      try {
        await ctx.answerCallbackQuery();
      } catch {}
      return ctx.reply("Scan error. Please try again with /scan.");
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
