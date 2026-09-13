import { curatedChronology } from "./chronology";

export interface TimelineBranch {
    /** Visual alignment only; this does not imply a connection to the anchor's universe. */
    anchorBefore?: string;
    /** Keep billboard artwork clear of the stream when viewed from above or below. */
    cardDepthOffset: number;
    connectionLabel?: string;
    /** Separate histories that share a lane when their crossover is filtered out. */
    detachedOffsetX?: number;
    entrySlugs?: readonly string[];
    /** A second continuation for histories that share a common past. */
    forkBefore?: string;
    forkIntoUniverse?: string;
    id?: string;
    markerCaption?: string;
    markerTitle?: string;
    /** Join the continuation beyond the final main-stream entry. */
    mergeAfter?: string;
    /** A viewing-order junction joins streams without changing universe identities. */
    mergeBefore?: string;
    /** Resolve a time-travel connection against another universe's stream. */
    mergeIntoUniverse?: string;
    offset: readonly [number, number];
    showUniverseMarker?: boolean;
    universe: string;
}

const universeBranches: readonly TimelineBranch[] = [
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-3.8, 2.8],
        showUniverseMarker: true,
        universe: "Earth-96283",
    },
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-6.4, 5.6],
        showUniverseMarker: true,
        universe: "Earth-120703",
    },
    {
        cardDepthOffset: 1.7,
        connectionLabel: "VIEWING ORDER",
        detachedOffsetX: -38,
        markerCaption: "REVISED FOX HISTORY",
        mergeBefore: "avengers-doomsday",
        offset: [-3.8, 2.8],
        showUniverseMarker: true,
        universe: "Earth-10005",
    },
    {
        cardDepthOffset: 1.7,
        detachedOffsetX: -60,
        markerCaption: "ORIGINAL FOX HISTORY",
        mergeBefore: "x-men-days-of-future-past-2014",
        mergeIntoUniverse: "Earth-10005",
        offset: [-6.4, 5.6],
        showUniverseMarker: true,
        universe: "Earth-41578",
    },
    {
        cardDepthOffset: 1.7,
        detachedOffsetX: -85,
        forkBefore: "x-men-days-of-future-past-2014",
        forkIntoUniverse: "Earth-10005",
        markerCaption: "FOX X-MEN",
        markerTitle: "SHARED HISTORY",
        mergeBefore: "x-men-origins-wolverine-2009",
        mergeIntoUniverse: "Earth-41578",
        offset: [0, 0],
        showUniverseMarker: true,
        universe: "Shared Fox history",
    },
    {
        anchorBefore: "wandavision",
        cardDepthOffset: 1.7,
        detachedOffsetX: -14,
        markerCaption: "OUTSIDE TIME",
        markerTitle: "TVA",
        offset: [3.8, -2.8],
        showUniverseMarker: true,
        universe: "TVA / Multiverse",
    },
    {
        anchorBefore: "wandavision",
        cardDepthOffset: 1.7,
        detachedOffsetX: -14,
        markerCaption: "MANY REALITIES",
        markerTitle: "MULTIVERSE",
        offset: [6.4, -5.6],
        showUniverseMarker: true,
        universe: "Multiverse",
    },
    {
        anchorBefore: "wandavision",
        cardDepthOffset: 1.7,
        detachedOffsetX: -14,
        offset: [9, -8.4],
        showUniverseMarker: true,
        universe: "Earth-89521",
    },
    {
        anchorBefore: "wonder-man",
        cardDepthOffset: 1.7,
        detachedOffsetX: 18,
        offset: [3.8, -2.8],
        showUniverseMarker: true,
        universe: "Earth-828",
    },
    {
        anchorBefore: "visionquest",
        cardDepthOffset: 1.7,
        detachedOffsetX: 18,
        markerCaption: "UNIVERSE",
        markerTitle: "UNCONFIRMED",
        offset: [6.4, -5.6],
        showUniverseMarker: true,
        universe: "TBD",
    },
];

// These entries retain their individual curated slots, rather than gathering all
// seasons at the first appearance of a universe. Release sorting changes card order,
// while the connection always identifies the same chronological destination.
function chronologicalBranches(branch: TimelineBranch): TimelineBranch[] {
    const groups = new Map<string, string[]>();
    const main = curatedChronology.filter((entry) => entry.universe === "Earth-616");
    const lastMain = main.at(-1);
    return curatedChronology
        .filter((entry) => entry.universe === branch.universe)
        .reduce<TimelineBranch[]>((result, entry) => {
            const next = main.find((item) => item.chronologyOrder > entry.chronologyOrder);
            const destination = next?.slug ?? lastMain?.slug;
            if (!destination) {
                return result;
            }
            const existing = groups.get(destination);
            if (existing) {
                existing.push(entry.slug);
            } else {
                const entrySlugs = [entry.slug];
                groups.set(destination, entrySlugs);
                result.push({
                    ...branch,
                    detachedOffsetX: (branch.detachedOffsetX ?? 0) + result.length * 12,
                    entrySlugs,
                    id: `${branch.universe}:${entry.slug}`,
                    mergeAfter: next ? undefined : destination,
                    mergeBefore: next?.slug,
                });
            }
            return result;
        }, []);
}

export const timelineBranches: readonly TimelineBranch[] = universeBranches.flatMap((branch) =>
    branch.anchorBefore ? chronologicalBranches(branch) : [branch]
);
