import { useEffect, useState } from "react";
import { axiosGet } from "@/redux/axios";

/**
 * Addresses the backend copies on outbound email by default (config/mandatoryCc
 * on the server), plus the submissions inbox for scrubber recommend mails.
 * Fetched once per page load and shared by every Cc field.
 */
type AlwaysCcConfig = { emails: string[]; submissionsInbox: string[] };

const EMPTY: AlwaysCcConfig = { emails: [], submissionsInbox: [] };

let cached: AlwaysCcConfig | null = null;
let inflight: Promise<AlwaysCcConfig> | null = null;

const toEmailList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((e) => String(e ?? "").trim()).filter(Boolean) : [];

function loadAlwaysCcConfig(): Promise<AlwaysCcConfig> {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
        inflight = axiosGet("/applications/mail-always-cc")
            .then((res) => {
                const data = (res?.data?.data ?? res?.data) as
                    | { emails?: unknown; submissionsInbox?: unknown }
                    | null;
                cached = {
                    emails: toEmailList(data?.emails),
                    submissionsInbox: toEmailList(data?.submissionsInbox),
                };
                return cached;
            })
            .catch(() => {
                // Not available (older backend): show no default chips; the next
                // mount tries again.
                inflight = null;
                return EMPTY;
            });
    }
    return inflight;
}

function useAlwaysCcConfig(): AlwaysCcConfig {
    const [config, setConfig] = useState<AlwaysCcConfig>(cached ?? EMPTY);
    useEffect(() => {
        let alive = true;
        void loadAlwaysCcConfig().then((next) => {
            if (alive) setConfig(next);
        });
        return () => {
            alive = false;
        };
    }, []);
    return config;
}

export function useAlwaysCcEmails(): string[] {
    return useAlwaysCcConfig().emails;
}

/** Submissions inbox copied on scrubber Recommend Approval mails. */
export function useSubmissionsInboxEmails(): string[] {
    return useAlwaysCcConfig().submissionsInbox;
}

/** True when `email` is one of the always-copied addresses (case-insensitive). */
export function isAlwaysCcEmail(email: string, alwaysCc: string[]): boolean {
    const key = String(email ?? "").trim().toLowerCase();
    return alwaysCc.some((e) => e.toLowerCase() === key);
}
