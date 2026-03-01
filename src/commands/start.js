import { Keyboard } from "grammy";
import { upsertUser } from "../stores/users.js";

export default function register(bot) {
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "";

    // Persist user if DB configured (best-effort)
    try {
      if (userId) await upsertUser(bot.cfg, { telegramUserId: userId, username });
    } catch {
      // ignore
    }

    const kb = new Keyboard()
      .text("Run scan")
      .text("My watchlist")
      .row()
      .text("My alerts")
      .text("Help")
      .resized();

    const warn =
      "Welcome to Solana Meme Scout.\n\n" +
      "Informational only, not financial advice. Memecoins are extremely high risk.\n\n" +
      "Choose an action below, or type /help for commands.";

    return ctx.reply(warn, { reply_markup: kb });
  });
}
