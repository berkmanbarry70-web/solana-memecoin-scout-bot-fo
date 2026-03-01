import { registerWatchlist } from "../features/watchlist.js";
import { cfg } from "../lib/config.js";
import { createTtlCache } from "../services/cache.js";

// This file exists only to expose the /watchlist command via the commands loader.
// The implementation is in src/features/watchlist.js.

const cache = createTtlCache({ max: 2000 });

export default function register(bot) {
  registerWatchlist(bot, { cfg, cache });
}
