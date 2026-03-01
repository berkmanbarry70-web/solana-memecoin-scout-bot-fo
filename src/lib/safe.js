export function safeErr(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    String(err)
  );
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function clampNumber(v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
