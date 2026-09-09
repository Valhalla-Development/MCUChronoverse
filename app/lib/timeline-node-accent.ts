import type { ContentType, TimelineEntry } from "../data/types";

const FALLBACK_ACCENT = "#ffad52";
const NODE_ACCENTS: Record<ContentType, string> = {
    film: "#ff7046",
    "one-shot": "#b88cff",
    series: "#5dbaff",
    short: FALLBACK_ACCENT,
    special: "#ffd260",
};
const ALTERNATE_UNIVERSE = /multiverse|earth-(?!616\b)\d+/i;

/** Universe metadata takes precedence; saga membership alone does not imply an alternate Earth. */
export function getTimelineNodeAccent(
    entry: Pick<TimelineEntry, "contentType" | "universe">
): string {
    if (ALTERNATE_UNIVERSE.test(entry.universe)) {
        return "#61e4a8";
    }
    return Object.hasOwn(NODE_ACCENTS, entry.contentType)
        ? NODE_ACCENTS[entry.contentType]
        : FALLBACK_ACCENT;
}
