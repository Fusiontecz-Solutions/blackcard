/**
 * Default Cc addresses (Mark@ / subs@) the user removed in the open mail popup.
 * The axios interceptor sends them as `x-default-cc-removed`; the backend then
 * leaves them off every mail sent while handling that request.
 */
const removed = new Set<string>();

export function setDefaultCcRemoved(email: string, isRemoved: boolean): void {
    const key = String(email ?? "").trim().toLowerCase();
    if (!key) return;
    if (isRemoved) removed.add(key);
    else removed.delete(key);
}

export function clearDefaultCcRemoved(): void {
    removed.clear();
}

export function getDefaultCcRemovedHeader(): string {
    return [...removed].join(",");
}
