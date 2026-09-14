"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { type MouseEventHandler, type RefObject, useCallback } from "react";
import type { TimelineEntry } from "../data/types";
import { isWatchable } from "../lib/timeline";
import { UiIcon } from "./ui-icon";

interface WatchProgressMenuProps {
    accountActionLabel: string;
    accountReady: boolean;
    containerRef: RefObject<HTMLElement | null>;
    nextEntries: TimelineEntry[];
    onAccountAction: () => void | Promise<void>;
    onEntrySelect: MouseEventHandler<HTMLButtonElement>;
    onEntryToggle: MouseEventHandler<HTMLButtonElement>;
    onReset: () => void;
    onToggleOpen: () => void;
    open: boolean;
    pendingSlug: string | null;
    signedIn: boolean;
    syncError: boolean;
    totalWatchedCount: number;
    visibleEntryCount: number;
    visibleWatchedCount: number;
}

interface WatchProgressTileProps {
    entry: TimelineEntry;
    onEntrySelect: MouseEventHandler<HTMLButtonElement>;
    onEntryToggle: MouseEventHandler<HTMLButtonElement>;
    pendingSlug: string | null;
}

function WatchProgressTile({
    entry,
    onEntrySelect,
    onEntryToggle,
    pendingSlug,
}: WatchProgressTileProps) {
    const watchable = isWatchable(entry);
    const pending = watchable && pendingSlug === entry.slug;
    let markLabel = `${entry.title} has not been released`;
    let markIcon: "check" | "minus" | "undo" = "minus";
    let markText = "Soon";
    if (watchable) {
        markLabel = pending
            ? `Undo marking ${entry.title} as watched`
            : `Mark ${entry.title} as watched`;
        markIcon = pending ? "undo" : "check";
        markText = pending ? "Undo" : "Mark";
    }

    return (
        <div
            className={`timeline-watchlist-tile-row ${pending ? "timeline-watchlist-tile-row-pending" : ""}`}
            data-unreleased={!watchable}
        >
            <button
                className="focus-ring timeline-watchlist-tile"
                data-slug={entry.slug}
                onClick={onEntrySelect}
                type="button"
            >
                <span className="timeline-watchlist-tile-poster">
                    {entry.posterUrl ? (
                        <Image
                            alt=""
                            aria-hidden="true"
                            className="object-cover"
                            fill
                            sizes="48px"
                            src={entry.posterUrl}
                        />
                    ) : (
                        <span>{entry.title.slice(0, 1)}</span>
                    )}
                </span>
                <span className="timeline-watchlist-tile-copy">
                    <span>
                        {entry.contentType.replace("-", " ")}
                        <i aria-hidden="true" />
                        {entry.placement}
                    </span>
                    <strong>{entry.title}</strong>
                </span>
                <span aria-hidden="true" className="timeline-watchlist-tile-arrow">
                    <UiIcon name="external-link" />
                </span>
            </button>
            <button
                aria-label={markLabel}
                className="focus-ring timeline-watchlist-mark"
                data-pending={pending}
                data-slug={entry.slug}
                data-unreleased={!watchable}
                disabled={!watchable}
                onClick={onEntryToggle}
                type="button"
            >
                <span aria-hidden="true" className="timeline-watchlist-mark-icon">
                    <UiIcon name={markIcon} />
                </span>
                <span>{markText}</span>
            </button>
        </div>
    );
}

export function WatchProgressMenu(props: WatchProgressMenuProps) {
    const {
        accountActionLabel,
        accountReady,
        containerRef,
        nextEntries,
        onAccountAction,
        onEntrySelect,
        onEntryToggle,
        onReset,
        onToggleOpen,
        open,
        pendingSlug,
        signedIn,
        syncError,
        totalWatchedCount,
        visibleEntryCount,
        visibleWatchedCount,
    } = props;
    const handleAccountAction = useCallback(() => {
        Promise.resolve(onAccountAction()).catch(() => undefined);
    }, [onAccountAction]);
    const progress = visibleEntryCount
        ? `${(visibleWatchedCount / visibleEntryCount) * 100}%`
        : "0%";
    const resetDescription = totalWatchedCount
        ? `Clear ${totalWatchedCount} watched ${totalWatchedCount === 1 ? "item" : "items"}`
        : "Nothing marked yet";
    let compactAccountActionLabel = "Checking...";
    if (accountReady) {
        compactAccountActionLabel = signedIn ? "Sign out" : "Sync progress";
    }

    return (
        <aside className="absolute top-5 right-18 z-110 sm:top-7 sm:right-22" ref={containerRef}>
            <button
                aria-controls="timeline-watchlist"
                aria-expanded={open}
                aria-label={open ? "Close watch progress" : "Open watch progress"}
                className="focus-ring timeline-watchlist-trigger"
                onClick={onToggleOpen}
                type="button"
            >
                <span className="timeline-watchlist-count">
                    <strong>{visibleWatchedCount}</strong>
                    <span>/ {visibleEntryCount}</span>
                </span>
                <span
                    aria-hidden="true"
                    className={`timeline-watchlist-chevron ${open ? "timeline-watchlist-chevron-open" : ""}`}
                >
                    <UiIcon name="chevron-down" />
                </span>
            </button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="timeline-watchlist-panel"
                        exit={{ opacity: 0, scale: 0.98, y: -8 }}
                        id="timeline-watchlist"
                        initial={{ opacity: 0, scale: 0.98, y: -8 }}
                        transition={{ duration: 0.18 }}
                    >
                        <div className="timeline-watchlist-heading">
                            <div>
                                <span>Watch progress</span>
                                <strong>
                                    {visibleWatchedCount} of {visibleEntryCount} complete
                                </strong>
                            </div>
                            <button
                                aria-label={accountActionLabel}
                                className="focus-ring timeline-watchlist-account"
                                disabled={!accountReady}
                                onClick={handleAccountAction}
                                type="button"
                            >
                                <UiIcon name={signedIn ? "sign-out" : "cloud-sync"} />
                                {compactAccountActionLabel}
                            </button>
                        </div>
                        <div className="timeline-watchlist-progress">
                            <span style={{ width: progress }} />
                        </div>
                        <p className="timeline-watchlist-label">Up next</p>
                        <section
                            aria-label="Upcoming timeline entries"
                            className="timeline-watchlist-tiles"
                        >
                            {nextEntries.length > 0 ? (
                                nextEntries.map((entry) => (
                                    <WatchProgressTile
                                        entry={entry}
                                        key={entry.slug}
                                        onEntrySelect={onEntrySelect}
                                        onEntryToggle={onEntryToggle}
                                        pendingSlug={pendingSlug}
                                    />
                                ))
                            ) : (
                                <p className="timeline-watchlist-empty">
                                    Everything in this view is watched.
                                </p>
                            )}
                        </section>
                        {totalWatchedCount > 0 ? (
                            <button
                                className="focus-ring timeline-watchlist-reset"
                                onClick={onReset}
                                type="button"
                            >
                                <span aria-hidden="true" className="timeline-watchlist-reset-icon">
                                    <UiIcon name="reset" />
                                </span>
                                <span className="timeline-watchlist-reset-copy">
                                    <strong>Reset watch data</strong>
                                    <small>{resetDescription}</small>
                                </span>
                            </button>
                        ) : null}
                        {signedIn && syncError ? (
                            <p className="timeline-watchlist-sync-error">
                                Sync failed. This device may be ahead of your account.
                            </p>
                        ) : null}
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </aside>
    );
}
