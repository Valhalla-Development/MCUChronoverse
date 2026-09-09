import type { ContentType, TimelineEntry } from "../data/types";

const FALLBACK_ACCENT = "#ffad52";
export const cardAccentColours: Record<ContentType, string> = {
    film: "#d98a7d",
    "one-shot": "#b88cff",
    series: "#65cfff",
    short: "#61e4a8",
    special: "#ffe08a",
};

const ALTERNATE_UNIVERSE = /multiverse|earth-(?!616\b)\d+/i;

/** Universe metadata takes precedence; saga membership alone does not imply an alternate Earth. */
export function getTimelineNodeAccent(
    entry: Pick<TimelineEntry, "contentType" | "universe">
): string {
    if (ALTERNATE_UNIVERSE.test(entry.universe)) {
        return "#61e4a8";
    }
    return Object.hasOwn(cardAccentColours, entry.contentType)
        ? cardAccentColours[entry.contentType]
        : FALLBACK_ACCENT;
}
