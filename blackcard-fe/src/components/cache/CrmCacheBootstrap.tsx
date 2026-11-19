import { useEffect } from "react";
import { bootstrapCrmCache } from "@/lib/crmCache";
import { hydrateApplicationDetailCacheFromCachedLists } from "@/lib/applicationsListCache";

/**
 * Hydrates in-memory (L1) caches from IndexedDB (L2) once per authenticated session.
 */
export default function CrmCacheBootstrap() {
  useEffect(() => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!token) return;
    void bootstrapCrmCache().then(() => {
      const run = () => hydrateApplicationDetailCacheFromCachedLists();
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run);
      } else {
        setTimeout(run, 0);
      }
    });
  }, []);

  return null;
}
