import type { CrmCacheEntry } from "./config";
import { getNamespaceConfig } from "./config";
import type { CrmCacheNamespace } from "./namespaces";

const DB_NAME = "ihcrm_cache_v2";
const DB_VERSION = 1;
const STORE = "entries";

type IdbRow = {
  namespace: CrmCacheNamespace;
  key: string;
  at: number;
  data: unknown;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function idbSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbSupported()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath: ["namespace", "key"],
          });
          store.createIndex("by_namespace", "namespace", { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(
  namespace: CrmCacheNamespace,
  key: string,
): Promise<CrmCacheEntry | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = (await reqToPromise(
      tx.objectStore(STORE).get([namespace, key]),
    )) as IdbRow | undefined;
    if (!row || typeof row.at !== "number") return undefined;
    const { ttlMs } = getNamespaceConfig(namespace);
    if (Date.now() - row.at > ttlMs) {
      void idbDelete(namespace, key);
      return undefined;
    }
    return { at: row.at, data: row.data };
  } catch {
    return undefined;
  }
}

export async function idbPut(
  namespace: CrmCacheNamespace,
  key: string,
  entry: CrmCacheEntry,
): Promise<void> {
  const { persistIdb } = getNamespaceConfig(namespace);
  if (!persistIdb) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const row: IdbRow = {
      namespace,
      key,
      at: entry.at,
      data: entry.data,
    };
    tx.objectStore(STORE).put(row);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota / private mode */
  }
}

export async function idbDelete(
  namespace: CrmCacheNamespace,
  key: string,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete([namespace, key]);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function idbGetAllByNamespace(
  namespace: CrmCacheNamespace,
): Promise<Array<{ key: string; entry: CrmCacheEntry }>> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("by_namespace");
    const rows = (await reqToPromise(
      index.getAll(namespace),
    )) as IdbRow[];
    const { ttlMs } = getNamespaceConfig(namespace);
    const now = Date.now();
    const out: Array<{ key: string; entry: CrmCacheEntry }> = [];
    for (const row of rows) {
      if (!row?.key || typeof row.at !== "number") continue;
      if (now - row.at > ttlMs) {
        void idbDelete(namespace, row.key);
        continue;
      }
      out.push({ key: row.key, entry: { at: row.at, data: row.data } });
    }
    return out;
  } catch {
    return [];
  }
}

export async function idbClearNamespace(
  namespace: CrmCacheNamespace,
): Promise<void> {
  const rows = await idbGetAllByNamespace(namespace);
  await Promise.all(rows.map((r) => idbDelete(namespace, r.key)));
}

export async function idbClearAll(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}
