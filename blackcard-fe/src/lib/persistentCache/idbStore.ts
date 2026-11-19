/**
 * Lightweight IndexedDB key-value store (L2). L1 remains in-memory Maps in feature caches.
 */

const DB_NAME = "ih_crm_persistent_cache";
const DB_VERSION = 1;
const STORE_NAME = "entries";

type StoredRow = {
  namespace: string;
  key: string;
  savedAt: number;
  payload: unknown;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error("idb open failed"));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ["namespace", "key"],
          });
          store.createIndex("by_namespace", "namespace", { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        tx.oncomplete = () => {
          if (req && "result" in req) {
            resolve((req as IDBRequest<T>).result);
          } else {
            resolve(undefined);
          }
        };
        tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
        if (req) {
          req.onerror = () => reject(req.error ?? new Error("idb request failed"));
        }
      }),
  );
}

export async function idbGet<T>(
  namespace: string,
  key: string,
): Promise<{ savedAt: number; payload: T } | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  try {
    const row = (await withStore<StoredRow>("readonly", (store) =>
      store.get([namespace, key]),
    )) as StoredRow | undefined;
    if (!row || row.namespace !== namespace) return undefined;
    return { savedAt: row.savedAt, payload: row.payload as T };
  } catch {
    return undefined;
  }
}

export async function idbSet(
  namespace: string,
  key: string,
  payload: unknown,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const row: StoredRow = {
    namespace,
    key,
    savedAt: Date.now(),
    payload,
  };
  try {
    await withStore("readwrite", (store) => store.put(row));
  } catch {
    /* quota / private mode */
  }
}

export async function idbDelete(namespace: string, key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withStore("readwrite", (store) => store.delete([namespace, key]));
  } catch {
    /* ignore */
  }
}

export async function idbClearNamespace(namespace: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_namespace");
      const range = IDBKeyRange.only(namespace);
      const req = index.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb clear failed"));
      req.onerror = () => reject(req.error ?? new Error("idb cursor failed"));
    });
  } catch {
    /* ignore */
  }
}

/** Returns all entries in a namespace (for "most recent" hydration). */
export async function idbGetAllInNamespace<T>(
  namespace: string,
): Promise<Array<{ key: string; savedAt: number; payload: T }>> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("by_namespace");
      const out: Array<{ key: string; savedAt: number; payload: T }> = [];
      const req = index.openCursor(IDBKeyRange.only(namespace));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const row = cursor.value as StoredRow;
        out.push({
          key: row.key,
          savedAt: row.savedAt,
          payload: row.payload as T,
        });
        cursor.continue();
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error ?? new Error("idb scan failed"));
      req.onerror = () => reject(req.error ?? new Error("idb scan cursor failed"));
    });
  } catch {
    return [];
  }
}

export async function idbClearAll(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withStore("readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}
