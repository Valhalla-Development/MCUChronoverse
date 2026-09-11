export interface TimelineBranch {
    /** Keep billboard artwork clear of the stream when viewed from above or below. */
    cardDepthOffset: number;
    /** Separate histories that share a lane when their crossover is filtered out. */
    detachedOffsetX?: number;
    /** A crossover joins the streams without changing the entries' universe identities. */
    mergeBefore: string;
    offset: readonly [number, number];
    universe: string;
}

export const timelineBranches: readonly TimelineBranch[] = [
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-3.8, 2.8],
        universe: "Earth-96283",
    },
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-6.4, 5.6],
        universe: "Earth-120703",
    },
    {
        cardDepthOffset: 1.7,
        detachedOffsetX: -38,
        mergeBefore: "deadpool-and-wolverine",
        offset: [-3.8, 2.8],
        universe: "Earth-10005",
    },
];
