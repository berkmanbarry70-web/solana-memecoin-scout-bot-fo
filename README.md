Solana Meme Scout is a Telegram bot that helps users discover potential Solana memecoins by scanning recent tokens, applying filters (liquidity/volume/age/risk flags), ranking results with an explainable score, and letting users maintain a watchlist with alerts.

Informational only. Not financial advice. Memecoins are high risk.

Setup
1) Requirements
1) Node.js 18+
2) A Telegram bot token from @BotFather
3) Optional but recommended: MongoDB (for persistence)
4) Required for AI summaries: CookMyBots AI Gateway credentials

2) Install
1) npm run install:root

3) Configure env
Copy .env.sample to .env and fill values.

4) Run
1) Dev: npm run dev
2) Start: npm start

Commands
1) /start
Shows welcome, disclaimer, and a quick actions keyboard.

2) /help
Shows all available commands and examples.

3) /scan
Interactive scan flow using inline buttons. Collects scan filters and risk toggles, then returns a ranked list of tokens.

4) /token <mintAddress>
Shows a detailed token view with metrics, links, score breakdown, and AI-written summary/risk notes.

5) /watchlist
Shows your saved tokens and allows quick view/remove.

6) /alerts
Create and manage alerts for tokens in your watchlist.

7) /reset
Clears stored conversation memory (AI context) for this user/chat.

8) /admin
Admin-only controls (health, cache refresh, broadcast). If ADMIN_TELEGRAM_USER_IDS is not configured, the command will say admin is not configured.

Architecture
1) src/index.js boots the process, validates TELEGRAM_BOT_TOKEN, starts polling with @grammyjs/runner, and starts the alerts polling loop.
2) src/bot.js wires middleware, commands, and the non-command AI catch-all handler.
3) src/services/solanaData.js provides token candidate scans and per-token metrics via a swappable provider interface.
4) src/services/scoring.js computes a transparent score + breakdown.
5) src/services/cache.js provides a small TTL cache to reduce API calls.
6) src/services/alertsEngine.js polls alerts periodically and sends notifications.
7) MongoDB persistence is handled via src/lib/db.js and store modules in src/stores/*.

Troubleshooting
1) Bot exits saying TELEGRAM_BOT_TOKEN is required
Set TELEGRAM_BOT_TOKEN in your environment and restart.

2) AI summaries not appearing
Set COOKMYBOTS_AI_ENDPOINT (base URL, example https://api.cookmybots.com/api/ai) and COOKMYBOTS_AI_KEY.

3) MongoDB not configured
The bot still runs, but watchlists and alerts will not persist across restarts. Set MONGODB_URI.

4) 409 Conflict from Telegram
This usually means two instances are polling. The bot auto-retries with backoff. Ensure only one service instance runs.
