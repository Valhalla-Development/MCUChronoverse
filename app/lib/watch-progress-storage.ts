export const WATCH_PROGRESS_STORAGE_KEY = "mcu-chronoverse:watch-progress";
export const LEGACY_WATCHED_STORAGE_KEY = "mcu-chronoverse:watched";

export interface WatchProgressStore {
    accounts: Record<string, string[]>;
    anonymousSlugs: string[];
    version: 2;
}

interface LegacyOwnedSnapshot {
    ownerId: string | null;
    slugs: string[];
    version: 1;
}

const splitEntrySlugs: Record<string, readonly string[]> = {
    "i-am-groot": ["i-am-groot-season-1", "i-am-groot-season-2"],
    "what-if": ["what-if-season-1", "what-if-season-2", "what-if-season-3"],
};

function uniqueStrings(value: unknown) {
    if (!(Array.isArray(value) && value.every((item) => typeof item === "string"))) {
        return null;
    }
    return [...new Set(value.flatMap((slug) => splitEntrySlugs[slug] ?? slug))];
}

function parseAccounts(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }

    const accounts: Record<string, string[]> = {};
    for (const [userId, slugs] of Object.entries(value)) {
        const parsedSlugs = uniqueStrings(slugs);
        if (!(userId && parsedSlugs)) {
            return null;
        }
        accounts[userId] = parsedSlugs;
    }
    return accounts;
}

function emptyStore(): WatchProgressStore {
    return { accounts: {}, anonymousSlugs: [], version: 2 };
}

function migrateOwnedSnapshot(value: unknown): WatchProgressStore | null {
    if (typeof value !== "object" || value === null || !("version" in value)) {
        return null;
    }
    const snapshot = value as Partial<LegacyOwnedSnapshot>;
    const slugs = uniqueStrings(snapshot.slugs);
    if (
        snapshot.version !== 1 ||
        !slugs ||
        !(typeof snapshot.ownerId === "string" || snapshot.ownerId === null)
    ) {
        return null;
    }
    return snapshot.ownerId
        ? { accounts: { [snapshot.ownerId]: slugs }, anonymousSlugs: [], version: 2 }
        : { accounts: {}, anonymousSlugs: slugs, version: 2 };
}

export function parseWatchProgressStore(
    storedValue: string | null,
    legacyValue: string | null = null
): WatchProgressStore {
    return parseCurrentStore(storedValue) ?? parseLegacyStore(legacyValue) ?? emptyStore();
}

function parseCurrentStore(storedValue: string | null): WatchProgressStore | null {
    try {
        const parsed: unknown = storedValue ? JSON.parse(storedValue) : null;
        return parseVersionedStore(parsed);
    } catch {
        // Invalid local data falls through to the older storage format.
    }
    return null;
}

function parseVersionedStore(value: unknown): WatchProgressStore | null {
    if (typeof value !== "object" || value === null || !("version" in value)) {
        return null;
    }
    if (value.version !== 2 || !("accounts" in value) || !("anonymousSlugs" in value)) {
        return migrateOwnedSnapshot(value);
    }
    const accounts = parseAccounts(value.accounts);
    const anonymousSlugs = uniqueStrings(value.anonymousSlugs);
    return accounts && anonymousSlugs ? { accounts, anonymousSlugs, version: 2 } : null;
}

function parseLegacyStore(legacyValue: string | null): WatchProgressStore | null {
    try {
        const legacySlugs = uniqueStrings(legacyValue ? JSON.parse(legacyValue) : null);
        if (legacySlugs) {
            return { accounts: {}, anonymousSlugs: legacySlugs, version: 2 };
        }
    } catch {
        // Invalid legacy data is discarded below.
    }
    return null;
}

export function readScopedProgress(store: WatchProgressStore, userId: string | null) {
    return userId ? (store.accounts[userId] ?? []) : store.anonymousSlugs;
}

export function writeScopedProgress(
    store: WatchProgressStore,
    userId: string | null,
    slugs: string[]
): WatchProgressStore {
    const uniqueSlugs = [...new Set(slugs)];
    if (!userId) {
        return { ...store, anonymousSlugs: uniqueSlugs };
    }
    return { ...store, accounts: { ...store.accounts, [userId]: uniqueSlugs } };
}
