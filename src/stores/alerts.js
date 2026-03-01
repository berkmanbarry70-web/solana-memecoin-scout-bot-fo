import { getDb } from "../lib/db.js";
import { safeErr } from "../lib/safe.js";

const COL = "alerts";

export async function createAlert(cfg, alert) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };

  const doc = {
    telegramUserId: String(alert.telegramUserId),
    mintAddress: String(alert.mintAddress),
    type: String(alert.type),
    enabled: alert.enabled !== false,
    params: alert.params || {},
    checkEverySeconds: Number(alert.checkEverySeconds || 60),
    lastTriggeredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await db.collection(COL).insertOne(doc);
    return { ok: true, db: true, id: doc._id };
  } catch (e) {
    console.error("[db] alerts create failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function listAlertsByUser(cfg, telegramUserId) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return [];
  try {
    return await db
      .collection(COL)
      .find({ telegramUserId: String(telegramUserId) })
      .sort({ createdAt: -1 })
      .toArray();
  } catch (e) {
    console.error("[db] alerts list failed", { err: safeErr(e) });
    return [];
  }
}

export async function listEnabledAlerts(cfg) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return [];
  try {
    return await db.collection(COL).find({ enabled: true }).toArray();
  } catch (e) {
    console.error("[db] alerts listEnabled failed", { err: safeErr(e) });
    return [];
  }
}

export async function setAlertEnabled(cfg, alertId, enabled) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };
  try {
    await db.collection(COL).updateOne(
      { _id: alertId },
      {
        $set: { enabled: !!enabled, updatedAt: new Date() },
      }
    );
    return { ok: true, db: true };
  } catch (e) {
    console.error("[db] alerts setEnabled failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function deleteAlert(cfg, alertId) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return { ok: false, db: false };
  try {
    await db.collection(COL).deleteOne({ _id: alertId });
    return { ok: true, db: true };
  } catch (e) {
    console.error("[db] alerts delete failed", { err: safeErr(e) });
    return { ok: false, db: true };
  }
}

export async function touchAlertTriggered(cfg, alertId) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return;
  try {
    await db.collection(COL).updateOne(
      { _id: alertId },
      { $set: { lastTriggeredAt: new Date(), updatedAt: new Date() } }
    );
  } catch (e) {
    console.error("[db] alerts touchTrigger failed", { err: safeErr(e) });
  }
}
