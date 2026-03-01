import { registerAlertsFlow } from "../features/alertsFlow.js";
import { cfg } from "../lib/config.js";

export default function register(bot) {
  registerAlertsFlow(bot, { cfg });
}
