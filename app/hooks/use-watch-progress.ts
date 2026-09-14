"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { isSupabaseConfigured } from "../lib/supabase/config";
import {
    clearRemoteWatchProgress,
    readRemoteWatchProgress,
    setRemoteWatchStatus,
} from "../lib/supabase/watch-progress";
import {
    LEGACY_WATCHED_STORAGE_KEY,
    parseWatchProgressStore,
    readScopedProgress,
    WATCH_PROGRESS_STORAGE_KEY,
    type WatchProgressStore,
    writeScopedProgress,
} from "../lib/watch-progress-storage";

function readLocalStore() {
    try {
        return parseWatchProgressStore(
            window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY),
            window.localStorage.getItem(LEGACY_WATCHED_STORAGE_KEY)
        );
    } catch {
        return parseWatchProgressStore(null);
    }
}

function writeLocalStore(store: WatchProgressStore) {
    try {
        window.localStorage.setItem(WATCH_PROGRESS_STORAGE_KEY, JSON.stringify(store));
        window.localStorage.removeItem(LEGACY_WATCHED_STORAGE_KEY);
    } catch {
        // In-memory progress remains available when browser storage is restricted.
    }
}

export function useWatchProgress() {
    const [user, setUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [syncError, setSyncError] = useState(false);
    const [watchedSlugs, setWatchedSlugs] = useState<string[]>([]);
    const progressStore = useRef<WatchProgressStore>(parseWatchProgressStore(null));
    const watchedSlugsRef = useRef<string[]>([]);
    const writeQueue = useRef(Promise.resolve());
    const userId = user?.id ?? null;

    const queueRemoteWrite = useCallback((write: () => Promise<void>) => {
        writeQueue.current = writeQueue.current
            .catch(() => undefined)
            .then(write)
            .then(() => {
                setSyncError(false);
            })
            .catch(() => {
                setSyncError(true);
            });
    }, []);

    const setScopedProgress = useCallback((slugs: string[], scopeUserId: string | null) => {
        const nextStore = writeScopedProgress(progressStore.current, scopeUserId, slugs);
        progressStore.current = nextStore;
        watchedSlugsRef.current = slugs;
        setWatchedSlugs(slugs);
        writeLocalStore(nextStore);
    }, []);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setAuthReady(true);
            return;
        }
        const supabase = createClient();
        let active = true;
        supabase.auth.getUser().then(({ data }) => {
            if (active) {
                setUser(data.user);
                setAuthReady(true);
            }
        });
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setAuthReady(true);
        });
        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!authReady) {
            return;
        }
        const localStore = readLocalStore();
        progressStore.current = localStore;

        if (!userId) {
            setScopedProgress(readScopedProgress(localStore, null), null);
            setSyncError(false);
            setLoaded(true);
            return;
        }

        let active = true;
        setLoaded(false);
        readRemoteWatchProgress(userId)
            .then((remoteSlugs) => {
                if (active) {
                    setScopedProgress(remoteSlugs, userId);
                    setSyncError(false);
                }
            })
            .catch(() => {
                if (active) {
                    const cachedSlugs = readScopedProgress(localStore, userId);
                    watchedSlugsRef.current = cachedSlugs;
                    setWatchedSlugs(cachedSlugs);
                    setSyncError(true);
                }
            })
            .finally(() => {
                if (active) {
                    setLoaded(true);
                }
            });
        return () => {
            active = false;
        };
    }, [authReady, setScopedProgress, userId]);

    const toggleWatched = useCallback(
        (slug: string) => {
            const { current } = watchedSlugsRef;
            const watched = !current.includes(slug);
            const next = watched ? [...current, slug] : current.filter((item) => item !== slug);
            setScopedProgress(next, userId);
            if (userId) {
                queueRemoteWrite(() => setRemoteWatchStatus(userId, slug, watched));
            }
        },
        [queueRemoteWrite, setScopedProgress, userId]
    );

    const resetWatchProgress = useCallback(() => {
        setScopedProgress([], userId);
        if (userId) {
            queueRemoteWrite(() => clearRemoteWatchProgress(userId));
        }
    }, [queueRemoteWrite, setScopedProgress, userId]);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured) {
            return;
        }
        await writeQueue.current;
        const { error } = await createClient().auth.signOut({ scope: "local" });
        if (error) {
            setSyncError(true);
        }
    }, []);

    return {
        authReady,
        loaded,
        resetWatchProgress,
        signOut,
        syncError,
        toggleWatched,
        user,
        watchedSlugs,
    };
}
