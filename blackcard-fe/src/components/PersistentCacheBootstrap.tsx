import { useEffect } from "react";
import { useStore } from "react-redux";
import type { AppStore } from "@/redux/store";
import { bootstrapPersistentCaches } from "@/lib/persistentCache/bootstrapPersistentCaches";

/** Warms L1 caches from IndexedDB once per app session. */
export function PersistentCacheBootstrap() {
  const store = useStore() as AppStore;

  useEffect(() => {
    void bootstrapPersistentCaches(store);
  }, [store]);

  return null;
}
