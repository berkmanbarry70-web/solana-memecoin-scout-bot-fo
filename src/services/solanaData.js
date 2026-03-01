import { safeErr, sleep } from "../lib/safe.js";

const DEFAULT_PROVIDER = "stub";

function nowMs() {
  return Date.now();
}

function normalizeCandidate(x) {
  return {
    mintAddress: String(x?.mintAddress || ""),
    symbol: String(x?.symbol || "").slice(0, 16),
    name: String(x?.name || "").slice(0, 48),
    priceUsd: x?.priceUsd ?? null,
    marketCapUsd: x?.marketCapUsd ?? null,
    liquidityUsd: x?.liquidityUsd ?? null,
    volume24hUsd: x?.volume24hUsd ?? null,
    volumeTrend: x?.volumeTrend ?? null,
    ageMinutes: x?.ageMinutes ?? null,
    holderCount: x?.holderCount ?? null,
    top1HolderPct: x?.top1HolderPct ?? null,
    top10HolderPct: x?.top10HolderPct ?? null,
    mintAuthorityDisabled: x?.mintAuthorityDisabled ?? null,
    freezeAuthorityDisabled: x?.freezeAuthorityDisabled ?? null,
    dexUrl: x?.dexUrl ?? null,
    explorerUrl: x?.explorerUrl ?? null,
    fetchedAt: new Date(),
    provider: String(x?.provider || DEFAULT_PROVIDER),
  };
}

async function fetchJson(url, { timeoutMs = 12_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "SolanaMemeScout/1.0" },
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!r.ok) throw new Error("HTTP_" + r.status);
    return json;
  } finally {
    clearTimeout(t);
  }
}

export function makeExplorerUrl(mintAddress) {
  const a = encodeURIComponent(String(mintAddress || ""));
  return a ? "https://solscan.io/token/" + a : null;
}

export function makeDexUrl(mintAddress) {
  const a = encodeURIComponent(String(mintAddress || ""));
  return a ? "https://dexscreener.com/solana/" + a : null;
}

export async function scanTokenCandidates(filters, { provider = DEFAULT_PROVIDER } = {}) {
  const startedAt = nowMs();
  console.log("[solanaData] scan start", { provider });

  try {
    // Provider is intentionally generic/swappable.
    // For now: return stub data so the full bot UX is runnable.
    // Replace this with a real provider implementation later.

    await sleep(150);

    const stubs = [
      {
        mintAddress: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Wrapped SOL",
        priceUsd: 150,
        marketCapUsd: null,
        liquidityUsd: 2_000_000,
        volume24hUsd: 50_000_000,
        volumeTrend: "flat",
        ageMinutes: 60 * 24 * 365,
        holderCount: 1_000_000,
        top1HolderPct: 5,
        top10HolderPct: 20,
        mintAuthorityDisabled: true,
        freezeAuthorityDisabled: true,
        provider,
      },
    ];

    const out = stubs.map((x) => {
      const n = normalizeCandidate(x);
      n.explorerUrl = n.explorerUrl || makeExplorerUrl(n.mintAddress);
      n.dexUrl = n.dexUrl || makeDexUrl(n.mintAddress);
      return n;
    });

    console.log("[solanaData] scan success", {
      provider,
      ms: nowMs() - startedAt,
      candidates: out.length,
    });

    return out;
  } catch (e) {
    console.warn("[solanaData] scan fail", {
      provider,
      ms: nowMs() - startedAt,
      err: safeErr(e),
    });
    throw e;
  }
}

export async function getTokenMetrics(mintAddress, { provider = DEFAULT_PROVIDER } = {}) {
  const startedAt = nowMs();
  console.log("[solanaData] token start", { provider });

  try {
    // Stub implementation: just re-use scan result format.
    // Replace with a real provider call, e.g. Dexscreener/SolanaFM/Helius/etc.

    await sleep(120);

    const n = normalizeCandidate({
      mintAddress,
      symbol: "",
      name: "",
      provider,
      explorerUrl: makeExplorerUrl(mintAddress),
      dexUrl: makeDexUrl(mintAddress),
    });

    console.log("[solanaData] token success", {
      provider,
      ms: nowMs() - startedAt,
    });

    return n;
  } catch (e) {
    console.warn("[solanaData] token fail", {
      provider,
      ms: nowMs() - startedAt,
      err: safeErr(e),
    });
    throw e;
  }
}
