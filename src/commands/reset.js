import { cfg } from "../lib/config.js";
import { clearUserMemory } from "../lib/memory.js";

export default function register(bot) {
  bot.command("reset", async (ctx) => {
    await clearUserMemory({
      mongoUri: cfg.MONGODB_URI,
      platform: "telegram",
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });
    await ctx.reply("Memory cleared for this chat.");
  });
}
