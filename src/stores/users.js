import { getDb } from "../lib/db.js";
import { safeErr } from "../lib/safe.js";

const COL = "users";

export async function upsertUser(cfg, { telegramUserId, username } = {}) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };

  const filter = { telegramUserId: String(telegramUserId) };
  const set = {
    username: username ? String(username) : "",
    updatedAt: new Date(),
  };

  try {
    await db.collection(COL).updateOne(
      filter,
      {
        $setOnInsert: { createdAt: new Date() },
        $set: set,
      },
      { upsert: true }
    );
    return { ok: true, db: true };
  } catch (e) {
    console.error("[db] users upsert failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function listAllUsers(cfg) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return [];
  try {
    return await db.collection(COL).find({}, { projection: { telegramUserId: 1 } }).toArray();
  } catch (e) {
    console.error("[db] users list failed", { err: safeErr(e) });
    return [];
  }
}

export async function updateUserLastScanAt(cfg, telegramUserId, date) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return;
  try {
    await db.collection(COL).updateOne(
      { telegramUserId: String(telegramUserId) },
      {
        $setOnInsert: { createdAt: new Date() },
        $set: { lastScanAt: date || new Date(), updatedAt: new Date() },
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("[db] users lastScanAt update failed", { err: safeErr(e) });
  }
}

export async function getUser(cfg, telegramUserId) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return null;
  try {
    return await db.collection(COL).findOne({ telegramUserId: String(telegramUserId) });
  } catch (e) {
    console.error("[db] users get failed", { err: safeErr(e) });
    return null;
  }
}
