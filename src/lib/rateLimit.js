export function createRateLimiter() {
  const map = new Map();

  function key(userId, action) {
    return String(userId || "") + ":" + String(action || "");
  }

  return {
    canRun({ userId, action, cooldownSeconds }) {
      const k = key(userId, action);
      const now = Date.now();
      const prev = map.get(k) || 0;
      const cdMs = Math.max(0, Number(cooldownSeconds || 0) * 1000);
      if (cdMs === 0) {
        map.set(k, now);
        return { ok: true, waitSeconds: 0 };
      }
      const next = prev + cdMs;
      if (now < next) {
        const waitMs = next - now;
        return { ok: false, waitSeconds: Math.ceil(waitMs / 1000) };
      }
      map.set(k, now);
      return { ok: true, waitSeconds: 0 };
    },
  };
}
