import { normalizeRoleKey } from "@/lib/sessionRole";

/** Agent, Super Admin, and Operations may add/edit bank details on the application Overview tab. */
export function canManageBankDetailsOnOverview(role: string | null | undefined): boolean {
    const roleKey = normalizeRoleKey(role ?? "");
    return (
        roleKey === "SUPER_ADMIN" ||
        roleKey === "OPERATIONS" ||
        roleKey === "AGENT"
    );
}
