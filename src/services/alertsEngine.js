import { safeErr, sleep } from "../lib/safe.js";
import { listEnabledAlerts, touchAlertTriggered } from "../stores/alerts.js";
import { getTokenMetrics } from "./solanaData.js";
import { scoreToken } from "./scoring.js";

function shouldTrigger(alert, metrics) {
  const type = String(alert?.type || "");
  const p = alert?.params || {};

  if (type === "price_change_pct") {
    // Stub: without historical candles, we cannot compute real change.
    // For now, never trigger.
    return false;
  }

  if (type === "liquidity_drop_pct") {
    return false;
  }

  if (type === "volume_spike_pct") {
    return false;
  }

  // If unknown type: do nothing.
  return false;
}

export function startAlertsLoop({ bot, cfg, cache, setRunningFlag }) {
  let stopped = false;

  async function loop() {
    console.log("[alerts] poll started", { intervalSeconds: cfg.ALERTS_POLL_INTERVAL_SECONDS });

    let cycles = 0;

    while (!stopped) {
      const cycleStarted = Date.now();
      cycles++;

      try {
        setRunningFlag?.(true);

        const alerts = await listEnabledAlerts(cfg);
        const uniqueTokens = new Set(alerts.map((a) => String(a.mintAddress || "")).filter(Boolean));

        let checked = 0;
        let triggered = 0;

        for (const mintAddress of uniqueTokens) {
          checked++;

          // Cache token metrics briefly during this cycle.
          const ckey = "metrics:" + mintAddress;
          let metrics = cache?.get(ckey);
          if (!metrics) {
            metrics = await getTokenMetrics(mintAddress);
            cache?.set(ckey, metrics, 30_000);
          }

          // Evaluate each alert for this token.
          const tokenAlerts = alerts.filter((a) => String(a.mintAddress) === String(mintAddress));
          for (const a of tokenAlerts) {
            const ok = shouldTrigger(a, metrics);
            if (!ok) continue;

            triggered++;
            await touchAlertTriggered(cfg, a._id);

            // Send notification
            try {
              const s = scoreToken(metrics);
              const msg = [
                "Alert triggered for " + (metrics.symbol || metrics.name || mintAddress),
                "Mint: " + mintAddress,
                "Score: " + s.score,
              ].join("\n");
              await bot.api.sendMessage(Number(a.telegramUserId), msg);
            } catch (e) {
              console.warn("[alerts] send fail", { err: safeErr(e) });
            }
          }
        }

        console.log("[alerts] cycle", {
          ms: Date.now() - cycleStarted,
          alerts: alerts.length,
          tokensChecked: checked,
          triggered,
        });

        // Memory log once per minute-ish
        if (cycles % Math.max(1, Math.round(60 / cfg.ALERTS_POLL_INTERVAL_SECONDS)) === 0) {
          const m = process.memoryUsage();
          console.log("[mem]", {
            rssMB: Math.round(m.rss / 1e6),
            heapUsedMB: Math.round(m.heapUsed / 1e6),
          });
        }
      } catch (e) {
        console.warn("[alerts] cycle fail", { err: safeErr(e) });
      } finally {
        setRunningFlag?.(true);
      }

      const sleepMs = Math.max(500, cfg.ALERTS_POLL_INTERVAL_SECONDS * 1000 - (Date.now() - cycleStarted));
      await sleep(sleepMs);
    }
  }

  loop();

  return {
    stop() {
      stopped = true;
    },
  };
}
