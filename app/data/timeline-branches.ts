export interface TimelineBranch {
    /** Visual alignment only; this does not imply a connection to the anchor's universe. */
    anchorBefore?: string;
    /** Keep billboard artwork clear of the stream when viewed from above or below. */
    cardDepthOffset: number;
    /** Separate histories that share a lane when their crossover is filtered out. */
    detachedOffsetX?: number;
    markerCaption?: string;
    markerTitle?: string;
    /** A crossover joins the streams without changing the entries' universe identities. */
    mergeBefore?: string;
    /** Resolve a time-travel connection against another universe's stream. */
    mergeIntoUniverse?: string;
    offset: readonly [number, number];
    showUniverseMarker?: boolean;
    universe: string;
}

export const timelineBranches: readonly TimelineBranch[] = [
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
        anchorBefore: "agatha-all-along",
        cardDepthOffset: 1.7,
        detachedOffsetX: -38,
        offset: [-3.8, 2.8],
        showUniverseMarker: true,
        universe: "Earth-10005",
    },
    {
        cardDepthOffset: 1.7,
        detachedOffsetX: -60,
        mergeBefore: "x-men-days-of-future-past-2014",
        mergeIntoUniverse: "Earth-10005",
        offset: [-6.4, 5.6],
        showUniverseMarker: true,
        universe: "Earth-41578",
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
