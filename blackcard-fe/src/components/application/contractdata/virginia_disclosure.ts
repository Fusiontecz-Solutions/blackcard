export function isVirginiaDisclosureState(state: string | null | undefined): boolean {
    const key = String(state ?? "")
        .trim()
        .toLowerCase();
    return key === "virginia" || key === "va";
}
