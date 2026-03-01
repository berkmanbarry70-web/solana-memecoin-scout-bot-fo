import { Bot } from "grammy";
import { cfg } from "./lib/config.js";
import { safeErr } from "./lib/safe.js";
import { addTurn, getRecentTurns } from "./lib/memory.js";
import { aiChat } from "./lib/ai.js";
import { buildBotProfile } from "./lib/botProfile.js";

const chatLocks = new Set();
let globalInFlight = 0;
const GLOBAL_CAP = 1;

function lockKey(ctx) {
  const chatId = ctx.chat?.id;
  return String(chatId || ctx.from?.id || "");
}

function shouldRespondInGroup(ctx) {
  const chatType = ctx.chat?.type || "private";
  if (chatType === "private") return true;

  const botUsername = (ctx.me && ctx.me.username) || (ctx.botInfo && ctx.botInfo.username) || "";
  if (!botUsername) return false;

  const raw = String(ctx.message?.text || "");

  const replyTo = ctx.message?.reply_to_message;
  const isReplyToBot =
    !!(replyTo && replyTo.from && replyTo.from.is_bot) &&
    String(replyTo.from.username || "").toLowerCase() === String(botUsername).toLowerCase();

  const ents = Array.isArray(ctx.message?.entities) ? ctx.message.entities : [];
  const isMentioned = ents.some((e) => {
    if (!e || e.type !== "mention") return false;
    const s = raw.slice(e.offset, e.offset + e.length);
    return s.toLowerCase() === "@" + String(botUsername).toLowerCase();
  });

  return isMentioned || isReplyToBot;
}

function stripMention(ctx, text) {
  const botUsername = (ctx.me && ctx.me.username) || (ctx.botInfo && ctx.botInfo.username) || "";
  if (!botUsername) return String(text || "").trim();
  const re = new RegExp("@" + String(botUsername) + "\\b", "ig");
  return String(text || "").replace(re, "").trim();
}

export function createBot(token) {
  const bot = new Bot(token);

  // attach config so command modules can use bot.cfg (without importing cfg everywhere)
  bot.cfg = cfg;

  // shared cache placeholder (admin refresh)
  bot._globalCache = {
    clear() {
      // no-op, feature modules may replace/extend
    },
  };

  bot.catch((err) => {
    console.warn("[bot] handler error", { err: safeErr(err?.error || err) });
  });

  // Catch-all: quick actions from /start keyboard
  bot.on("message:text", async (ctx, next) => {
    const t = String(ctx.message?.text || "").trim();
    if (t.startsWith("/")) return next();

    if (t === "Run scan") return ctx.reply("Starting scan… Type /scan");
    if (t === "My watchlist") return ctx.reply("Type /watchlist");
    if (t === "My alerts") return ctx.reply("Type /alerts");
    if (t === "Help") return ctx.reply("Type /help");

    return next();
  });

  // AI catch-all for non-command text (kept minimal; does not replace real commands)
  bot.on("message:text", async (ctx, next) => {
    const raw = String(ctx.message?.text || "");
    if (raw.startsWith("/")) return next();

    if (!shouldRespondInGroup(ctx)) return next();

    const prompt = stripMention(ctx, raw);
    if (!prompt) return next();

    const k = lockKey(ctx);
    if (chatLocks.has(k)) return ctx.reply("I’m working on your last request. One moment.");
    if (globalInFlight >= GLOBAL_CAP) return ctx.reply("Busy right now. Try again in a moment.");

    chatLocks.add(k);
    globalInFlight++;

    try {
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;

      await addTurn({
        mongoUri: cfg.MONGODB_URI,
        platform: "telegram",
        userId,
        chatId,
        role: "user",
        text: prompt,
      });

      const recent = await getRecentTurns({
        mongoUri: cfg.MONGODB_URI,
        platform: "telegram",
        userId,
        chatId,
        limit: 12,
      });

      const botProfile = buildBotProfile();
      const messages = [
        { role: "system", content: botProfile },
        ...recent.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.text || "").slice(0, 2000),
        })),
      ];

      const res = await aiChat(
        cfg,
        { messages, meta: { platform: "telegram", feature: "chat" } },
        { retries: cfg.AI_MAX_RETRIES }
      );

      if (!res.ok) {
        return ctx.reply("I can help with /scan, /token, /watchlist, and /alerts. Type /help.");
      }

      const text = String(res.content || "").trim().slice(0, 3500);

      await addTurn({
        mongoUri: cfg.MONGODB_URI,
        platform: "telegram",
        userId,
        chatId,
        role: "assistant",
        text,
      });

      return ctx.reply(text);
    } catch (e) {
      console.warn("[ai] chat handler failed", { err: safeErr(e) });
      return ctx.reply("Something went wrong. Try /help.");
    } finally {
      chatLocks.delete(k);
      globalInFlight = Math.max(0, globalInFlight - 1);
    }
  });

  return bot;
}
