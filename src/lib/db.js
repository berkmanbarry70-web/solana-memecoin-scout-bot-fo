import { MongoClient } from "mongodb";
import { safeErr } from "./safe.js";

let _client = null;
let _db = null;
let _mongoUri = "";

export async function getDb(mongoUri) {
  if (!mongoUri) return null;
  if (_db && _mongoUri === mongoUri) return _db;

  try {
    _mongoUri = mongoUri;
    _client = new MongoClient(mongoUri, {
      maxPoolSize: 5,
      ignoreUndefined: true,
    });
    await _client.connect();
    _db = _client.db();
    console.log("[db] connected", { ok: true });
    return _db;
  } catch (e) {
    console.error("[db] connect failed", { err: safeErr(e) });
    _db = null;
    return null;
  }
}
