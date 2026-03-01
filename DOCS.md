Solana Meme Scout is a Telegram bot that scans recent Solana tokens, applies filters and risk checks, ranks candidates with an explainable score, and supports a watchlist with alerts.

Disclaimer
This bot is informational only and not financial advice. Memecoins are extremely high risk.

Public commands
1) /start
Welcome message, disclaimer, and quick action buttons.

2) /help
Shows usage and examples for all commands.

3) /scan
Starts a guided scan flow.

4) /token <mintAddress>
Shows a detailed token view for the given Solana mint address.
Example: /token So11111111111111111111111111111111111111112

5) /watchlist
Shows your watchlist.

6) /alerts
Create/manage alerts for tokens in your watchlist.

7) /reset
Clears AI conversation memory for this chat/user.

8) /admin
Admin-only tools (health, refresh cache, broadcast).

Environment variables
1) TELEGRAM_BOT_TOKEN (required)
Telegram bot token.

2) MONGODB_URI (optional but recommended)
MongoDB connection string used to persist users, watchlist, alerts, and scan preferences. If missing, the bot will run with limited persistence.

3) COOKMYBOTS_AI_ENDPOINT (required for AI summaries)
Base URL for CookMyBots AI Gateway. Example: https://api.cookmybots.com/api/ai

4) COOKMYBOTS_AI_KEY (required for AI summaries)
Key for CookMyBots AI Gateway.

5) AI_TIMEOUT_MS (optional)
Timeout for AI requests in ms. Default 600000.

6) AI_MAX_RETRIES (optional)
Retries for AI requests. Default 2.

7) SCAN_COOLDOWN_SECONDS (optional)
Per-user cooldown for /scan. Default 60.

8) ALERTS_POLL_INTERVAL_SECONDS (optional)
How often alerts are evaluated. Default 60.

9) ADMIN_TELEGRAM_USER_IDS (optional)
Comma-separated list of Telegram numeric user IDs allowed to use /admin.

Setup
1) Install dependencies: npm run install:root
2) Configure environment variables (copy .env.sample)
3) Run locally: npm run dev

Troubleshooting
1) If scans return empty results, try relaxing filters or retry later. Data providers can be temporarily unavailable.
2) If alerts do not trigger, ensure MONGODB_URI is set and the process is running continuously.
