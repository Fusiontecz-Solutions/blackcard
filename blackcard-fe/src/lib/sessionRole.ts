import { jwtDecode } from "jwt-decode";

export function normalizeRoleKey(role: string): string {
  const r = role.trim();
  if (!r) return "";
  let key = r.toUpperCase().replace(/\s+/g, "_");
  if (key === "FINALUNDERWRITER" || key === "FINAL_UNDERWRITER") key = "UNDERWRITER";
  if (key === "SUPERADMIN") key = "SUPER_ADMIN";
  return key;
}

export function resolveSessionRole(
  loginUser: { role?: string } | undefined,
): string {
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const u = JSON.parse(raw) as { role?: string };
      if (u?.role && typeof u.role === "string") return u.role;
    }
  } catch {
    /* ignore invalid JSON */
  }
  return loginUser?.role ?? localStorage.getItem("role") ?? "";
}

/**
 * Prefer JWT role (matches the active token after impersonation); then storage / Redux fallbacks.
 */
export type SessionUserLite = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

/** Logged-in user from localStorage, Redux, or JWT (page refresh safe). */
export function resolveSessionUser(
  loginUser?:
    | {
        id?: string;
        _id?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: string;
        name?: string;
      }
    | null
    | undefined,
): SessionUserLite | null {
  const fromRecord = (u: Record<string, unknown>): SessionUserLite | null => {
    const id = String(u.id ?? u._id ?? "").trim();
    if (!id) return null;
    let firstName = String(u.firstName ?? "").trim();
    let lastName = String(u.lastName ?? "").trim();
    if (!firstName && !lastName && typeof u.name === "string") {
      const parts = u.name.trim().split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    return {
      id,
      firstName,
      lastName,
      email: String(u.email ?? "").trim(),
      role: String(u.role ?? localStorage.getItem("role") ?? "").trim(),
    };
  };

  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const parsed = fromRecord(JSON.parse(raw) as Record<string, unknown>);
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }

  if (loginUser) {
    const parsed = fromRecord(loginUser as Record<string, unknown>);
    if (parsed) return parsed;
  }

  try {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = jwtDecode<{
        id?: string;
        sub?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        name?: string;
        role?: string;
      }>(token);
      const parsed = fromRecord(decoded as Record<string, unknown>);
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export function formatSessionUserDisplayName(user: SessionUserLite | null): string {
  if (!user) return "";
  const full = `${user.firstName} ${user.lastName}`.trim();
  return full || user.email || "";
}

export function resolveEffectiveRole(
  loginUser: { role?: string } | undefined,
): string {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = jwtDecode<{ role?: string }>(token);
      if (
        decoded?.role &&
        typeof decoded.role === "string" &&
        decoded.role.trim() !== ""
      ) {
        return decoded.role;
      }
    }
  } catch {
    /* ignore */
  }
  return resolveSessionRole(loginUser);
}

export function isSuperAdminRole(role?: string | null): boolean {
  const key = normalizeRoleKey(String(role ?? ""));
  return key === "SUPER_ADMIN";
}
