"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    type ChangeEvent,
    type MouseEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type ContentType,
    contentTypeLabels,
    contentTypes,
    type McuPhase,
    phases,
    type TimelineEntry,
} from "../data/types";
import { useWatchProgress } from "../hooks/use-watch-progress";
import {
    emptyTimelineFilters,
    filterTimeline,
    isWatchable,
    parseTimelineFilters,
    serializeTimelineFilters,
    type TimelineFilters,
    type TimelineOrder,
    timelineOrders,
} from "../lib/timeline";
import { AuthMenu } from "./auth-menu";
import { UiIcon } from "./ui-icon";
import { WatchProgressMenu } from "./watch-progress-menu";

const TimelineOrbit = dynamic(
    () => import("./timeline-orbit").then((module) => module.TimelineOrbit),
    {
        loading: () => (
            <div className="grid h-full place-items-center bg-[#020203]">
                <p className="font-mono text-[0.7rem] text-white/35 uppercase tracking-[0.2em]">
                    Opening temporal archive
                </p>
            </div>
        ),
        ssr: false,
    }
);

interface TimelineExplorerProps {
    entries: readonly TimelineEntry[];
}

interface FocusRequest {
    index: number;
    key: number;
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function timelineStepDisabled(index: number, count: number, direction: -1 | 1): boolean {
    if (count === 0) {
        return true;
    }
    return direction === -1 ? index === 0 : index === count - 1;
}

function isContentType(value: string | undefined): value is ContentType {
    return contentTypes.some((type) => type === value);
}

function isMcuPhase(value: string | undefined): value is McuPhase {
    return phases.some((phase) => phase === value);
}

const contentTypeNames: Record<ContentType, string> = {
    film: "Film",
    "one-shot": "One-Shot",
    series: "Series",
    short: "Short",
    special: "Special",
};

const timelineOrderLabels: Record<TimelineOrder, string> = {
    chronology: "Chronological",
    release: "Release date",
};

interface TimelineDetailProps {
    entry: TimelineEntry;
    onClose: () => void;
    onToggleWatched: () => void;
    watched: boolean;
}

function TimelineDetail({ entry, onClose, onToggleWatched, watched }: TimelineDetailProps) {
    const watchable = isWatchable(entry);
    let watchAction = "Unavailable";
    let watchLabel = "Not released yet";
    if (watchable) {
        watchAction = watched ? "Undo" : "Mark watched";
        watchLabel = watched ? "Watched" : "Not watched yet";
    }

    return (
        <motion.aside
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="timeline-detail-card absolute bottom-36 left-4 z-100 w-[min(47rem,calc(100%-2rem))] sm:bottom-40 sm:left-7 sm:w-[min(47rem,calc(100%-3.5rem))]"
            data-timeline-detail="true"
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            transition={{ damping: 30, stiffness: 280, type: "spring" }}
        >
            <div className="timeline-detail-glow" />
            <div className="timeline-detail-grid">
                <motion.div
                    className="timeline-detail-poster-shell"
                    layoutId={`timeline-poster-${entry.slug}`}
                    transition={{ damping: 30, stiffness: 280, type: "spring" }}
                >
                    {entry.posterUrl ? (
                        <>
                            <Image
                                alt=""
                                aria-hidden="true"
                                className="timeline-detail-poster-ambient"
                                fill
                                sizes="(max-width: 640px) 108px, 192px"
                                src={entry.posterUrl}
                            />
                            <Image
                                alt={`${entry.title} poster`}
                                className="timeline-detail-poster"
                                fill
                                sizes="(max-width: 640px) 108px, 192px"
                                src={entry.posterUrl}
                            />
                        </>
                    ) : (
                        <div className="timeline-detail-poster-fallback">
                            <span>Poster unavailable</span>
                        </div>
                    )}
                    <div className="timeline-detail-poster-shade" />
                    <span className="timeline-detail-order">
                        #{String(entry.chronologyOrder / 10).padStart(2, "0")}
                    </span>
                </motion.div>
                <motion.div
                    animate={{ opacity: 1, x: 0 }}
                    className="timeline-detail-content"
                    initial={{ opacity: 0, x: -12 }}
                    transition={{ delay: 0.12, duration: 0.24 }}
                >
                    <div className="timeline-detail-heading">
                        <div>
                            <div className="timeline-detail-kicker">
                                <p className="timeline-detail-eyebrow">
                                    {entry.placement}
                                    <span aria-hidden="true">
                                        <UiIcon name="diamond" />
                                    </span>
                                    {contentTypeNames[entry.contentType]}
                                </p>
                                <span className="timeline-detail-saga" data-saga={entry.saga}>
                                    <UiIcon name="sparkle" />
                                    {entry.saga}
                                </span>
                            </div>
                            <h1 className="timeline-detail-title">{entry.title}</h1>
                        </div>
                        <button
                            aria-label="Close event details"
                            className="focus-ring timeline-detail-close"
                            onClick={onClose}
                            type="button"
                        >
                            <UiIcon name="close" />
                        </button>
                    </div>

                    <div className="timeline-detail-facts">
                        {entry.rating === undefined ? null : (
                            <div className="timeline-detail-rating">
                                <span aria-hidden="true" className="timeline-detail-star">
                                    <UiIcon name="star" />
                                </span>
                                <strong>{entry.rating.toFixed(1)}</strong>
                                <span>/ 10</span>
                            </div>
                        )}
                        <span>{entry.runtime}</span>
                        {entry.phase ? <span>{entry.phase}</span> : null}
                        <span>{entry.releaseDate.slice(0, 4)}</span>
                    </div>

                    {entry.creditScenes ? (
                        <div className="timeline-detail-credits">
                            <span aria-hidden="true" className="timeline-detail-credits-mark">
                                <UiIcon name="sparkle" />
                            </span>
                            <span className="timeline-detail-credits-label">Credit scenes</span>
                            <dl className="timeline-detail-credits-statuses">
                                <div data-present={entry.creditScenes.during}>
                                    <dt>During</dt>
                                    <dd>{entry.creditScenes.during ? "Yes" : "No"}</dd>
                                </div>
                                <div data-present={entry.creditScenes.after}>
                                    <dt>After</dt>
                                    <dd>{entry.creditScenes.after ? "Yes" : "No"}</dd>
                                </div>
                            </dl>
                        </div>
                    ) : null}

                    <p className="timeline-detail-description">{entry.description}</p>

                    {entry.genres && entry.genres.length > 0 ? (
                        <div className="timeline-detail-genres">
                            {entry.genres.map((genre) => (
                                <span key={genre}>{genre}</span>
                            ))}
                        </div>
                    ) : null}

                    <button
                        aria-pressed={watchable && watched}
                        className="focus-ring timeline-detail-watch"
                        data-unreleased={!watchable}
                        data-watched={watched}
                        disabled={!watchable}
                        onClick={onToggleWatched}
                        type="button"
                    >
                        <span aria-hidden="true" className="timeline-detail-watch-check">
                            <UiIcon name={watchable ? "check" : "minus"} />
                        </span>
                        <span className="timeline-detail-watch-copy">
                            <span>Watch progress</span>
                            <strong>{watchLabel}</strong>
                        </span>
                        <span className="timeline-detail-watch-action">{watchAction}</span>
                    </button>

                    <div className="timeline-detail-footer">
                        <div className="timeline-detail-universe">
                            <span>Universe</span>
                            <strong>{entry.universe}</strong>
                        </div>
                        {entry.imdbUrl ? (
                            <div className="timeline-detail-links">
                                <a
                                    className="focus-ring timeline-detail-imdb"
                                    href={entry.imdbUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    <span className="timeline-detail-imdb-mark">IMDb</span>
                                    <span>Open on IMDb</span>
                                    <span aria-hidden="true" className="timeline-detail-arrow">
                                        <UiIcon name="external-link" />
                                    </span>
                                </a>
                                <a
                                    className="focus-ring timeline-detail-imdb timeline-detail-trakt"
                                    href={entry.traktUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    <svg
                                        aria-label="Trakt"
                                        className="timeline-detail-trakt-mark"
                                        role="img"
                                        viewBox="0 0 48 48"
                                    >
                                        <defs>
                                            <radialGradient
                                                cx="48.46"
                                                cy="-.95"
                                                gradientUnits="userSpaceOnUse"
                                                id="trakt-logo-gradient"
                                                r="64.84"
                                            >
                                                <stop offset="0" stopColor="#9f42c6" />
                                                <stop offset=".53" stopColor="#aa39ad" />
                                                <stop offset=".82" stopColor="#cf2061" />
                                                <stop offset="1" stopColor="#f50613" />
                                            </radialGradient>
                                        </defs>
                                        <path
                                            d="M48 11.26v25.47C48 42.95 42.95 48 36.73 48H11.26C5.04 48 0 42.95 0 36.73V11.26C0 5.04 5.04 0 11.26 0h25.47a11.24 11.24 0 0 1 9.62 5.4c1.06 1.72 1.65 3.74 1.65 5.86Z"
                                            fill="url(#trakt-logo-gradient)"
                                        />
                                        <path
                                            d="m13.62 17.97 7.92 7.92 1.47-1.47-7.92-7.92-1.47 1.47Zm14.39 14.4 1.47-1.46-2.16-2.16L47.64 8.43c-.19-.75-.46-1.46-.79-2.14L24.39 28.75l3.62 3.62Zm-15.09-13.7-1.46 1.46 14.4 14.4 1.46-1.47L23 28.75 46.35 5.4c-.36-.6-.78-1.16-1.25-1.68L21.54 27.28l-8.62-8.61Zm34.95-9.09L28.7 28.75l1.47 1.46L48 12.38v-1.12c0-.57-.04-1.14-.13-1.68ZM25.16 22.27l-7.92-7.92-1.47 1.47 7.92 7.92 1.47-1.47Zm16.16 12.85c0 3.42-2.78 6.2-6.2 6.2H12.88c-3.42 0-6.2-2.78-6.2-6.2V12.88c0-3.42 2.78-6.21 6.2-6.21h20.78V4.6H12.88c-4.56 0-8.28 3.71-8.28 8.28v22.24c0 4.56 3.71 8.28 8.28 8.28h22.24c4.56 0 8.28-3.71 8.28-8.28v-3.51h-2.07v3.51Z"
                                            fill="#fff"
                                        />
                                    </svg>
                                    <span>Open on Trakt</span>
                                    <span aria-hidden="true" className="timeline-detail-arrow">
                                        <UiIcon name="external-link" />
                                    </span>
                                </a>
                            </div>
                        ) : null}
                    </div>
                </motion.div>
            </div>
        </motion.aside>
    );
}

export function TimelineExplorer({ entries }: TimelineExplorerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchString = searchParams.toString();
    const [filters, setFilters] = useState<TimelineFilters>(() =>
        parseTimelineFilters(searchParams)
    );
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [watchlistOpen, setWatchlistOpen] = useState(false);
    const [timelineIndex, setTimelineIndex] = useState(0);
    const [focusRequest, setFocusRequest] = useState<FocusRequest>({ index: 0, key: 0 });
    const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
    const {
        authReady,
        loaded: watchProgressLoaded,
        resetWatchProgress,
        signOut,
        syncError,
        toggleWatched,
        user: authUser,
        watchedSlugs,
    } = useWatchProgress();
    const [pendingWatchSlug, setPendingWatchSlug] = useState<string | null>(null);
    const [pendingWatchReturnIndex, setPendingWatchReturnIndex] = useState<number | null>(null);
    const filtersRef = useRef<HTMLElement>(null);
    const watchlistRef = useRef<HTMLElement>(null);
    const pendingWatchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setFilters(parseTimelineFilters(new URLSearchParams(searchString)));
    }, [searchString]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setFiltersOpen(false);
                setWatchlistOpen(false);
                setSelectedEntry(null);
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, []);

    useEffect(
        () => () => {
            clearTimeout(pendingWatchTimeout.current ?? undefined);
        },
        []
    );

    useEffect(() => {
        const handleOutsidePointerDown = (event: globalThis.PointerEvent) => {
            const { target } = event;
            if (
                target instanceof Node &&
                !filtersRef.current?.contains(target) &&
                !watchlistRef.current?.contains(target)
            ) {
                setFiltersOpen(false);
                setWatchlistOpen(false);
            }
        };

        document.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, []);

    const updateFilters = useCallback(
        (nextFilters: TimelineFilters) => {
            setFilters(nextFilters);
            const params = serializeTimelineFilters(nextFilters);
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router]
    );

    const visibleEntries = useMemo(() => filterTimeline(entries, filters), [entries, filters]);
    const safeTimelineIndex = Math.min(timelineIndex, Math.max(visibleEntries.length - 1, 0));
    const activeEntry = visibleEntries[safeTimelineIndex];
    const nextEntry = visibleEntries[safeTimelineIndex + 1];
    const activeFilterCount =
        filters.types.length +
        filters.phases.length +
        (filters.query ? 1 : 0) +
        Number(filters.order === "release");
    let accountActionLabel = "Checking account...";
    if (authReady) {
        accountActionLabel = authUser
            ? "Sign out of account progress"
            : "Sign in for synced progress";
    }
    const watchedVisibleCount = visibleEntries.filter(
        (entry) => isWatchable(entry) && watchedSlugs.includes(entry.slug)
    ).length;
    const watchableVisibleCount = visibleEntries.filter(isWatchable).length;
    const nextUnwatchedEntries = useMemo(() => {
        const pendingEntry = visibleEntries.find((entry) => entry.slug === pendingWatchSlug);
        const upcomingEntries = visibleEntries.filter(
            (entry) => !watchedSlugs.includes(entry.slug) && entry.slug !== pendingWatchSlug
        );
        return [pendingEntry, ...upcomingEntries].filter((entry) => entry !== undefined);
    }, [pendingWatchSlug, visibleEntries, watchedSlugs]);
    const toggleFilters = useCallback(() => {
        setWatchlistOpen(false);
        setFiltersOpen((current) => !current);
    }, []);
    const toggleWatchlist = useCallback(() => {
        setFiltersOpen(false);
        setWatchlistOpen((current) => !current);
    }, []);
    const closeDetail = useCallback(() => setSelectedEntry(null), []);
    const resetWatchStatus = useCallback(() => {
        clearTimeout(pendingWatchTimeout.current ?? undefined);
        setPendingWatchSlug(null);
        setPendingWatchReturnIndex(null);
        resetWatchProgress();
    }, [resetWatchProgress]);
    const handleWatchMenuAuth = useCallback(async () => {
        if (authUser) {
            await signOut();
        } else {
            window.dispatchEvent(new Event("mcu-chronoverse:open-auth"));
        }
    }, [authUser, signOut]);
    const toggleSelectedWatched = useCallback(() => {
        if (selectedEntry && isWatchable(selectedEntry)) {
            toggleWatched(selectedEntry.slug);
        }
    }, [selectedEntry, toggleWatched]);
    const handleOutsidePointerDown = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            if (!selectedEntry) {
                return;
            }
            const { target } = event;
            if (target instanceof Element && target.closest("[data-timeline-detail]")) {
                return;
            }
            setSelectedEntry(null);
        },
        [selectedEntry]
    );
    const resetFilters = useCallback(() => updateFilters(emptyTimelineFilters), [updateFilters]);
    const handleSearchChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            updateFilters({ ...filters, query: event.currentTarget.value });
        },
        [filters, updateFilters]
    );
    const handleTypeToggle = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            const type = event.currentTarget.dataset.value;
            if (!isContentType(type)) {
                return;
            }
            updateFilters({ ...filters, types: toggleValue(filters.types, type) });
        },
        [filters, updateFilters]
    );
    const handleOrderChange = useCallback(
        (event: MouseEvent<HTMLButtonElement>) =>
            updateFilters({
                ...filters,
                order: event.currentTarget.dataset.value as TimelineOrder,
            }),
        [filters, updateFilters]
    );
    const handlePhaseToggle = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            const phase = event.currentTarget.dataset.value;
            if (!isMcuPhase(phase)) {
                return;
            }
            updateFilters({ ...filters, phases: toggleValue(filters.phases, phase) });
        },
        [filters, updateFilters]
    );
    const selectEntry = useCallback(
        (slug: string) => {
            const entry = entries.find((item) => item.slug === slug) ?? null;
            setSelectedEntry(entry);
            if (entry) {
                const index = visibleEntries.findIndex((item) => item.slug === entry.slug);
                if (index >= 0) {
                    setTimelineIndex(index);
                    setFocusRequest((current) => ({ index, key: current.key + 1 }));
                }
            }
        },
        [entries, visibleEntries]
    );
    const handleWatchlistEntrySelect = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            const { slug } = event.currentTarget.dataset;
            if (slug) {
                selectEntry(slug);
                setWatchlistOpen(false);
            }
        },
        [selectEntry]
    );
    const focusTimelineAt = useCallback((index: number) => {
        if (index < 0) {
            return;
        }
        setSelectedEntry(null);
        setTimelineIndex(index);
        setFocusRequest((current) => ({ index, key: current.key + 1 }));
    }, []);
    const handleTimelineStep = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            const direction = Number(event.currentTarget.dataset.direction);
            const nextIndex = Math.min(
                Math.max(safeTimelineIndex + direction, 0),
                Math.max(visibleEntries.length - 1, 0)
            );
            focusTimelineAt(nextIndex);
        },
        [focusTimelineAt, safeTimelineIndex, visibleEntries.length]
    );
    const undoPendingWatch = useCallback(
        (entryIndex: number) => {
            setPendingWatchSlug(null);
            setPendingWatchReturnIndex(null);
            focusTimelineAt(pendingWatchReturnIndex ?? entryIndex);
        },
        [focusTimelineAt, pendingWatchReturnIndex]
    );
    const beginPendingWatch = useCallback(
        (slug: string, entryIndex: number) => {
            const nextIndex = visibleEntries.findIndex(
                (entry) =>
                    entry.slug !== slug && isWatchable(entry) && !watchedSlugs.includes(entry.slug)
            );
            setPendingWatchSlug(slug);
            setPendingWatchReturnIndex(entryIndex >= 0 ? entryIndex : null);
            focusTimelineAt(nextIndex);
            pendingWatchTimeout.current = setTimeout(() => {
                setPendingWatchSlug(null);
                setPendingWatchReturnIndex(null);
            }, 2200);
        },
        [focusTimelineAt, visibleEntries, watchedSlugs]
    );
    const handleWatchlistToggle = useCallback(
        (event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            const { slug } = event.currentTarget.dataset;
            const targetEntry = visibleEntries.find((entry) => entry.slug === slug);
            if (!(slug && targetEntry && isWatchable(targetEntry))) {
                return;
            }
            const entryIndex = visibleEntries.findIndex((entry) => entry.slug === slug);
            const undoing = pendingWatchSlug === slug;
            toggleWatched(slug);
            clearTimeout(pendingWatchTimeout.current ?? undefined);
            if (undoing) {
                undoPendingWatch(entryIndex);
                return;
            }
            beginPendingWatch(slug, entryIndex);
        },
        [beginPendingWatch, pendingWatchSlug, toggleWatched, undoPendingWatch, visibleEntries]
    );
    const handleTimelineChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const index = Number(event.currentTarget.value);
        if (!Number.isInteger(index)) {
            return;
        }
        setSelectedEntry(null);
        setTimelineIndex(index);
        setFocusRequest((current) => ({ index, key: current.key + 1 }));
    }, []);

    useEffect(() => {
        if (!watchProgressLoaded) {
            return;
        }
        const unavailableSlugs = entries
            .filter((entry) => !isWatchable(entry) && watchedSlugs.includes(entry.slug))
            .map((entry) => entry.slug);
        for (const slug of unavailableSlugs) {
            toggleWatched(slug);
        }
    }, [entries, toggleWatched, watchProgressLoaded, watchedSlugs]);

    useEffect(() => {
        if (!watchProgressLoaded) {
            return;
        }
        setSelectedEntry((current) =>
            current && visibleEntries.some((entry) => entry.slug === current.slug) ? current : null
        );
        const firstUnwatchedIndex = visibleEntries.findIndex(
            (entry) => isWatchable(entry) && !watchedSlugs.includes(entry.slug)
        );
        const resetIndex = firstUnwatchedIndex >= 0 ? firstUnwatchedIndex : 0;
        setTimelineIndex(resetIndex);
        setFocusRequest((current) => ({ index: resetIndex, key: current.key + 1 }));
    }, [visibleEntries, watchProgressLoaded]);

    return (
        <LayoutGroup id="timeline-entry-expansion">
            <main
                className="relative h-dvh min-h-128 overflow-hidden bg-[#020203] text-ink"
                onPointerDown={handleOutsidePointerDown}
            >
                <div className="absolute inset-0 isolate z-0">
                    <TimelineOrbit
                        entries={visibleEntries}
                        focusIndex={focusRequest.index}
                        focusKey={focusRequest.key}
                        onSelect={selectEntry}
                        selectedSlug={selectedEntry?.slug}
                    />
                </div>
                <div className="grain" />

                <div className="pointer-events-none absolute top-0 right-0 left-0 z-20 h-40 bg-linear-to-b from-black/70 to-transparent" />
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-48 bg-linear-to-t from-black/75 to-transparent" />

                <header className="absolute top-5 left-5 z-80 sm:top-7 sm:left-7">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center border border-[#ff9b4a]/60 bg-black/45 font-mono font-semibold text-[#ffb260] text-xs shadow-[0_0_30px_rgb(255_112_35/12%)] backdrop-blur-xl">
                            616
                        </span>
                        <div>
                            <h1 className="font-semibold text-sm uppercase tracking-[0.22em]">
                                MCU <span className="text-white/42">Chronoverse</span>
                                <span className="sr-only"> chronological timeline</span>
                            </h1>
                            <nav className="mt-1 flex items-center gap-2 font-mono text-[0.7rem] text-white/30 uppercase tracking-[0.15em]">
                                <a
                                    className="focus-ring transition-colors hover:text-white/65"
                                    href="/about"
                                >
                                    About
                                </a>
                                <span aria-hidden="true" className="text-white/15">
                                    /
                                </span>
                                <a
                                    className="focus-ring transition-colors hover:text-white/65"
                                    href="/contact"
                                >
                                    Contact
                                </a>
                            </nav>
                        </div>
                    </div>
                </header>

                <AuthMenu />

                <WatchProgressMenu
                    accountActionLabel={accountActionLabel}
                    accountReady={authReady}
                    containerRef={watchlistRef}
                    nextEntries={nextUnwatchedEntries}
                    onAccountAction={handleWatchMenuAuth}
                    onEntrySelect={handleWatchlistEntrySelect}
                    onEntryToggle={handleWatchlistToggle}
                    onReset={resetWatchStatus}
                    onToggleOpen={toggleWatchlist}
                    open={watchlistOpen}
                    pendingSlug={pendingWatchSlug}
                    signedIn={Boolean(authUser)}
                    syncError={syncError}
                    totalWatchedCount={watchedSlugs.length}
                    visibleEntryCount={watchableVisibleCount}
                    visibleWatchedCount={watchedVisibleCount}
                />

                <aside
                    className="absolute top-5 right-5 z-110 w-12 sm:top-7 sm:right-7"
                    ref={filtersRef}
                >
                    <div className="flex justify-end">
                        <button
                            aria-controls="timeline-filters"
                            aria-expanded={filtersOpen}
                            aria-label={filtersOpen ? "Close filters" : "Open filters"}
                            className="focus-ring group grid size-12 place-items-center rounded-full border border-white/15 bg-black/58 shadow-[0_14px_50px_rgb(0_0_0/36%)] backdrop-blur-xl transition-all hover:border-[#ff9b4a]/70 hover:bg-[#171114]/80"
                            onClick={toggleFilters}
                            type="button"
                        >
                            <span
                                aria-hidden="true"
                                className="relative flex size-5 items-center justify-center"
                            >
                                <span
                                    className={`absolute h-px w-4 bg-[#ffad55] transition-transform duration-200 ${filtersOpen ? "rotate-45" : "-translate-y-1.5"}`}
                                />
                                <span
                                    className={`absolute h-px w-4 bg-[#ffad55] transition-all duration-200 ${filtersOpen ? "opacity-0" : ""}`}
                                />
                                <span
                                    className={`absolute h-px w-4 bg-[#ffad55] transition-transform duration-200 ${filtersOpen ? "-rotate-45" : "translate-y-1.5"}`}
                                />
                            </span>
                            {activeFilterCount > 0 ? (
                                <span className="absolute top-0 right-0 grid size-4 translate-x-1/4 -translate-y-1/4 place-items-center rounded-full bg-[#ff8a3d] font-mono text-[0.625rem] text-black">
                                    {activeFilterCount}
                                </span>
                            ) : null}
                        </button>
                    </div>

                    <AnimatePresence>
                        {filtersOpen ? (
                            <motion.div
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="timeline-filter-panel"
                                exit={{ opacity: 0, scale: 0.98, y: -8 }}
                                id="timeline-filters"
                                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                                transition={{ duration: 0.18 }}
                            >
                                <div className="timeline-filter-heading">
                                    <div>
                                        <p>Filter timeline</p>
                                        <strong>
                                            {visibleEntries.length} of {entries.length} events
                                            visible
                                        </strong>
                                    </div>
                                    {activeFilterCount > 0 ? (
                                        <button
                                            className="focus-ring timeline-filter-reset"
                                            onClick={resetFilters}
                                            type="button"
                                        >
                                            <UiIcon name="reset" />
                                            Reset
                                        </button>
                                    ) : null}
                                </div>

                                <label className="timeline-filter-search">
                                    <span className="sr-only">Search timeline</span>
                                    <UiIcon name="search" />
                                    <input
                                        className="focus-ring"
                                        onChange={handleSearchChange}
                                        placeholder="Search titles and stories"
                                        type="search"
                                        value={filters.query}
                                    />
                                </label>

                                <fieldset className="timeline-filter-group">
                                    <legend>Timeline order</legend>
                                    <div className="timeline-filter-order">
                                        {timelineOrders.map((order) => {
                                            const active = filters.order === order;
                                            return (
                                                <button
                                                    aria-pressed={active}
                                                    className="focus-ring timeline-filter-order-option"
                                                    data-value={order}
                                                    key={order}
                                                    onClick={handleOrderChange}
                                                    type="button"
                                                >
                                                    {timelineOrderLabels[order]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>

                                <fieldset className="timeline-filter-group">
                                    <legend>Format</legend>
                                    <div className="timeline-filter-formats">
                                        {contentTypes.map((type) => {
                                            const active = filters.types.includes(type);
                                            return (
                                                <button
                                                    aria-pressed={active}
                                                    className="focus-ring timeline-filter-format-option"
                                                    data-value={type}
                                                    key={type}
                                                    onClick={handleTypeToggle}
                                                    type="button"
                                                >
                                                    {contentTypeLabels[type]}
                                                    <span aria-hidden="true">
                                                        <UiIcon name="check" />
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>

                                <fieldset className="timeline-filter-group">
                                    <legend>Phase</legend>
                                    <div className="timeline-filter-phases">
                                        {phases.map((phase, index) => {
                                            const active = filters.phases.includes(phase);
                                            return (
                                                <button
                                                    aria-pressed={active}
                                                    className="focus-ring timeline-filter-phase-option"
                                                    data-value={phase}
                                                    key={phase}
                                                    onClick={handlePhaseToggle}
                                                    type="button"
                                                >
                                                    <span>
                                                        {String(index + 1).padStart(2, "0")}
                                                    </span>
                                                    {phase}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </aside>

                <AnimatePresence>
                    {selectedEntry ? (
                        <TimelineDetail
                            entry={selectedEntry}
                            key={selectedEntry.slug}
                            onClose={closeDetail}
                            onToggleWatched={toggleSelectedWatched}
                            watched={watchedSlugs.includes(selectedEntry.slug)}
                        />
                    ) : null}
                </AnimatePresence>

                <nav
                    aria-label="Scroll through the timeline"
                    className="timeline-dock absolute bottom-5 left-1/2 z-80 w-[min(34rem,calc(100%-3rem))] -translate-x-1/2 sm:bottom-7"
                >
                    <div className="flex items-end justify-between gap-4">
                        <p className="truncate font-semibold text-sm text-white/78 tracking-[-0.02em]">
                            {activeEntry?.title ?? "No matching events"}
                        </p>
                        <p className="shrink-0 font-mono text-[0.7rem] text-white/35 uppercase tracking-[0.13em]">
                            {visibleEntries.length === 0
                                ? "No events"
                                : `${String(safeTimelineIndex + 1).padStart(2, "0")} / ${String(visibleEntries.length).padStart(2, "0")}`}
                        </p>
                    </div>

                    <div className="timeline-scrubber-controls mt-3">
                        <button
                            aria-controls="timeline-position"
                            aria-label="Previous timeline entry"
                            className="focus-ring timeline-scrubber-step"
                            data-direction="-1"
                            disabled={timelineStepDisabled(
                                safeTimelineIndex,
                                visibleEntries.length,
                                -1
                            )}
                            onClick={handleTimelineStep}
                            type="button"
                        >
                            <UiIcon name="chevron-left" />
                        </button>
                        <div className="timeline-scrubber">
                            <div
                                aria-hidden="true"
                                className="timeline-scrubber-progress"
                                style={{
                                    width:
                                        visibleEntries.length > 1
                                            ? `${(safeTimelineIndex / (visibleEntries.length - 1)) * 100}%`
                                            : "0%",
                                }}
                            />
                            <div aria-hidden="true" className="timeline-scrubber-track" />
                            <input
                                aria-label="Timeline position"
                                className="timeline-scrubber-input"
                                id="timeline-position"
                                max={Math.max(visibleEntries.length - 1, 0)}
                                min="0"
                                onChange={handleTimelineChange}
                                step="1"
                                type="range"
                                value={visibleEntries.length > 0 ? safeTimelineIndex : 0}
                            />
                        </div>
                        <button
                            aria-controls="timeline-position"
                            aria-label="Next timeline entry"
                            className="focus-ring timeline-scrubber-step"
                            data-direction="1"
                            disabled={timelineStepDisabled(
                                safeTimelineIndex,
                                visibleEntries.length,
                                1
                            )}
                            onClick={handleTimelineStep}
                            type="button"
                        >
                            <UiIcon name="chevron-right" />
                        </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[0.7rem] text-white/28 uppercase tracking-[0.14em]">
                        <span>{activeEntry?.placement ?? "Origin"}</span>
                        <span className="text-[#ffb05e]/65">Drag to travel</span>
                        <span>{nextEntry?.placement ?? "Destination"}</span>
                    </div>
                </nav>
            </main>
        </LayoutGroup>
    );
}
