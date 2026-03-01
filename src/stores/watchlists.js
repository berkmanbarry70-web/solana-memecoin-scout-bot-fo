import { getDb } from "../lib/db.js";
import { safeErr } from "../lib/safe.js";

const COL = "watchlists";

export async function addToWatchlist(cfg, telegramUserId, mintAddress) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };

  try {
    await db.collection(COL).updateOne(
      { telegramUserId: String(telegramUserId) },
      {
        $setOnInsert: { createdAt: new Date() },
        $set: { updatedAt: new Date() },
        $addToSet: {
          items: {
            mintAddress: String(mintAddress),
            addedAt: new Date(),
          },
        },
      },
      { upsert: true }
    );
    return { ok: true, db: true };
  } catch (e) {
    console.error("[db] watchlists add failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function removeFromWatchlist(cfg, telegramUserId, mintAddress) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };

  try {
    await db.collection(COL).updateOne(
      { telegramUserId: String(telegramUserId) },
      {
        $set: { updatedAt: new Date() },
        $pull: { items: { mintAddress: String(mintAddress) } },
      }
    );
    return { ok: true, db: true };
  } catch (e) {
    console.error("[db] watchlists remove failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function getWatchlist(cfg, telegramUserId) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { telegramUserId: String(telegramUserId), items: [] };

  try {
    const doc = await db.collection(COL).findOne({ telegramUserId: String(telegramUserId) });
    return doc || { telegramUserId: String(telegramUserId), items: [] };
  } catch (e) {
    console.error("[db] watchlists get failed", { err: safeErr(e) });
    return { telegramUserId: String(telegramUserId), items: [] };
  }
}

export async function isInWatchlist(cfg, telegramUserId, mintAddress) {
  const wl = await getWatchlist(cfg, telegramUserId);
  return Array.isArray(wl.items) && wl.items.some((x) => x?.mintAddress === String(mintAddress));
}
