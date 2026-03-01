export default function register(bot) {
  bot.command("help", async (ctx) => {
    const text = [
      "Solana Meme Scout commands:",
      "",
      "/start",
      "Shows welcome and quick actions.",
      "",
      "/scan",
      "Guided scan flow. Example: /scan",
      "",
      "/token <mintAddress>",
      "Shows details + AI summary. Example: /token So11111111111111111111111111111111111111112",
      "",
      "/watchlist",
      "Shows your saved tokens.",
      "",
      "/alerts",
      "Manage alerts for watchlist tokens.",
      "",
      "/admin",
      "Admin controls (only if ADMIN_TELEGRAM_USER_IDS is configured).",
      "",
      "/reset",
      "Clears AI conversation memory for this chat/user.",
    ].join("\n");

    return ctx.reply(text);
  });
}
