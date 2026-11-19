import type { CrmCacheEntry } from "./config";
import { getNamespaceConfig } from "./config";
import type { CrmCacheNamespace } from "./namespaces";

function compositeKey(namespace: CrmCacheNamespace, key: string): string {
  return `${namespace}\0${key}`;
}

const memory = new Map<string, CrmCacheEntry>();

export function memoryGet<T>(
  namespace: CrmCacheNamespace,
  key: string,
): T | undefined {
  const entry = memory.get(compositeKey(namespace, key));
  if (!entry) return undefined;
  const { ttlMs } = getNamespaceConfig(namespace);
  if (Date.now() - entry.at > ttlMs) {
    memory.delete(compositeKey(namespace, key));
    return undefined;
  }
  return entry.data as T;
}

export function memoryGetEntry(
  namespace: CrmCacheNamespace,
  key: string,
): CrmCacheEntry | undefined {
  const ck = compositeKey(namespace, key);
  const entry = memory.get(ck);
  if (!entry) return undefined;
  const { ttlMs } = getNamespaceConfig(namespace);
  if (Date.now() - entry.at > ttlMs) {
    memory.delete(ck);
    return undefined;
  }
  return entry;
}

export function memorySet<T>(
  namespace: CrmCacheNamespace,
  key: string,
  data: T,
  at: number = Date.now(),
): void {
  const ck = compositeKey(namespace, key);
  memory.set(ck, { at, data });
  pruneNamespace(namespace);
}

export function memorySetFromHydrate(
  namespace: CrmCacheNamespace,
  key: string,
  entry: CrmCacheEntry,
): void {
  const { ttlMs } = getNamespaceConfig(namespace);
  if (Date.now() - entry.at > ttlMs) return;
  memory.set(compositeKey(namespace, key), entry);
}

export function memoryDelete(namespace: CrmCacheNamespace, key: string): void {
  memory.delete(compositeKey(namespace, key));
}

export function memoryClearNamespace(namespace: CrmCacheNamespace): void {
  const prefix = `${namespace}\0`;
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}

export function memoryClearAll(): void {
  memory.clear();
}

export function memoryEntriesForNamespace(
  namespace: CrmCacheNamespace,
): Array<{ key: string; entry: CrmCacheEntry }> {
  const prefix = `${namespace}\0`;
  const out: Array<{ key: string; entry: CrmCacheEntry }> = [];
  const { ttlMs } = getNamespaceConfig(namespace);
  const now = Date.now();
  for (const [ck, entry] of memory.entries()) {
    if (!ck.startsWith(prefix)) continue;
    if (now - entry.at > ttlMs) {
      memory.delete(ck);
      continue;
    }
    out.push({ key: ck.slice(prefix.length), entry });
  }
  return out;
}

function pruneNamespace(namespace: CrmCacheNamespace): void {
  const { maxEntries } = getNamespaceConfig(namespace);
  const rows = memoryEntriesForNamespace(namespace);
  if (rows.length <= maxEntries) return;
  rows.sort((a, b) => a.entry.at - b.entry.at);
  const drop = rows.length - maxEntries;
  for (let i = 0; i < drop; i++) {
    memory.delete(compositeKey(namespace, rows[i].key));
  }
}

/** Newest valid entry in a namespace (e.g. applications list first paint). */
export function memoryGetFreshestInNamespace<T>(
  namespace: CrmCacheNamespace,
): T | undefined {
  const rows = memoryEntriesForNamespace(namespace);
  if (!rows.length) return undefined;
  rows.sort((a, b) => b.entry.at - a.entry.at);
  return rows[0].entry.data as T;
}
