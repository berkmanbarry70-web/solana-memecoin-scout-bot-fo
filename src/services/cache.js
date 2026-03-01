import { safeErr } from "../lib/safe.js";

export function createTtlCache({ max = 2000 } = {}) {
  const map = new Map();

  function prune() {
    if (map.size <= max) return;
    const n = Math.ceil(max * 0.1);
    const keys = map.keys();
    for (let i = 0; i < n; i++) {
      const k = keys.next().value;
      if (k === undefined) break;
      map.delete(k);
    }
  }

  return {
    get(key) {
      try {
        const v = map.get(key);
        if (!v) return null;
        if (v.expiresAt && Date.now() > v.expiresAt) {
          map.delete(key);
          return null;
        }
        return v.value;
      } catch (e) {
        console.warn("[cache] get failed", { err: safeErr(e) });
        return null;
      }
    },
    set(key, value, ttlMs = 30_000) {
      try {
        map.set(key, {
          value,
          expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
        });
        prune();
      } catch (e) {
        console.warn("[cache] set failed", { err: safeErr(e) });
      }
    },
    del(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    size() {
      return map.size;
    },
  };
}
