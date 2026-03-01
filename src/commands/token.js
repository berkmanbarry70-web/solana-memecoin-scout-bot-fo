import { registerTokenView } from "../features/tokenView.js";
import { cfg } from "../lib/config.js";
import { createTtlCache } from "../services/cache.js";

const cache = createTtlCache({ max: 2000 });

export default function register(bot) {
  registerTokenView(bot, { cfg, cache });
}
