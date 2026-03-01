import { registerScanFlow } from "../features/scanFlow.js";
import { cfg } from "../lib/config.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { createTtlCache } from "../services/cache.js";

const rateLimiter = createRateLimiter();
const cache = createTtlCache({ max: 2000 });

export default function register(bot) {
  registerScanFlow(bot, { cfg, rateLimiter, cache });
}
