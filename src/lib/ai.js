import { safeErr, sleep } from "./safe.js";

function trimSlash(u) {
  u = String(u || "");
  while (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { ctrl, clear: () => clearTimeout(t) };
}

async function readJsonSafe(r) {
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { text, json };
}

function notConfigured(message) {
  return { ok: false, status: 412, json: null, error: message };
}

function pickModel(cfg, override) {
  const m = String(override || cfg?.AI_MODEL || "").trim();
  return m || undefined;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function aiChat(cfg, { messages, model, meta } = {}, { timeoutMs, retries } = {}) {
  const base = trimSlash(cfg?.COOKMYBOTS_AI_ENDPOINT || "");
  const key = String(cfg?.COOKMYBOTS_AI_KEY || "");
  if (!base || !key) return notConfigured("AI_NOT_CONFIGURED (missing COOKMYBOTS_AI_ENDPOINT/COOKMYBOTS_AI_KEY)");

  const effectiveTimeoutMs = Number(timeoutMs || cfg?.AI_TIMEOUT_MS || 600_000);
  const maxRetries = Number.isFinite(retries) ? Number(retries) : Number(cfg?.AI_MAX_RETRIES ?? 2);

  const url = base + "/chat";
  const startedAt = Date.now();
  const debug = !!cfg?.AI_DEBUG;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { ctrl, clear } = withTimeout(effectiveTimeoutMs);
    try {
      console.log("[ai] chat start", { attempt: attempt + 1, url, hasModel: !!model });

      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: Array.isArray(messages) ? messages : [],
          model: pickModel(cfg, model),
          meta: meta || undefined,
        }),
        signal: ctrl.signal,
      });

      const { json } = await readJsonSafe(r);

      if (!r.ok) {
        const err = safeErr({ response: { data: json } }) || "AI_ERROR";
        console.warn("[ai] chat fail", { status: r.status, ms: Date.now() - startedAt, err });
        if (attempt < maxRetries && isRetryableStatus(r.status)) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        return { ok: false, status: r.status, json, error: err };
      }

      if (!json?.ok || !json?.output) {
        const err = "AI_BAD_RESPONSE";
        console.warn("[ai] chat fail", { status: r.status, ms: Date.now() - startedAt, err });
        return { ok: false, status: r.status, json, error: err };
      }

      const content = String(json?.output?.content || "").trim();
      if (debug) console.log("[ai] chat success", { ms: Date.now() - startedAt, chars: content.length });
      else console.log("[ai] chat success", { ms: Date.now() - startedAt });

      return { ok: true, status: r.status, json, content };
    } catch (e) {
      const err = safeErr(e);
      console.warn("[ai] chat exception", { ms: Date.now() - startedAt, err });
      if (attempt < maxRetries) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      return { ok: false, status: e?.name === "AbortError" ? 408 : 0, json: null, error: err };
    } finally {
      clear();
    }
  }

  return { ok: false, status: 0, json: null, error: "AI_UNKNOWN" };
}
