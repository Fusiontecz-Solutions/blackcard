/**
 * Book CRMs do not have the Super Admin permission matrix.
 * Reports hub treats authenticated staff as allowed for UI gates.
 */
export function usePermissions() {
  return {
    can: (_code?: string) => true,
    canAny: (_codes?: string[]) => true,
    permissions: [] as string[],
    loading: false,
  };
}
