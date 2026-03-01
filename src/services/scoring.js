import { clampNumber } from "../lib/safe.js";

export function scoreToken(m) {
  const breakdown = {};

  const liquidity = clampNumber(m?.liquidityUsd, { min: 0, max: 1e12, fallback: 0 });
  const volume24h = clampNumber(m?.volume24hUsd, { min: 0, max: 1e12, fallback: 0 });
  const ageMinutes = clampNumber(m?.ageMinutes, { min: 0, max: 1e9, fallback: 0 });
  const holders = clampNumber(m?.holderCount, { min: 0, max: 1e9, fallback: 0 });
  const top10Pct = clampNumber(m?.top10HolderPct, { min: 0, max: 100, fallback: 0 });

  const mintDisabled = m?.mintAuthorityDisabled === true;
  const freezeDisabled = m?.freezeAuthorityDisabled === true;

  breakdown.liquidity = Math.round(Math.min(30, Math.log10(liquidity + 1) * 10));
  breakdown.volume24h = Math.round(Math.min(25, Math.log10(volume24h + 1) * 8));

  const ageScore = ageMinutes <= 30 ? 2 : ageMinutes <= 120 ? 6 : ageMinutes <= 1440 ? 10 : 8;
  breakdown.age = ageScore;

  breakdown.holders = Math.round(Math.min(15, Math.log10(holders + 1) * 5));

  const concPenalty = top10Pct >= 80 ? -18 : top10Pct >= 65 ? -12 : top10Pct >= 50 ? -6 : 0;
  breakdown.concentration = concPenalty;

  breakdown.authorities = (mintDisabled ? 5 : -6) + (freezeDisabled ? 5 : -6);

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  const flags = [];
  if (!mintDisabled) flags.push("mint on");
  if (!freezeDisabled) flags.push("freeze on");
  if (top10Pct >= 65) flags.push("top10 " + Math.round(top10Pct) + "%");
  if (liquidity > 0 && liquidity < 10_000) flags.push("low liq");
  if (holders > 0 && holders < 100) flags.push("few holders");

  return { score, breakdown, flags };
}
