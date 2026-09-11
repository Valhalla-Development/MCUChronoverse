export interface TimelineBranch {
    /** Keep billboard artwork clear of the stream when viewed from above or below. */
    cardDepthOffset: number;
    /** A crossover joins the streams without changing the entries' universe identities. */
    mergeBefore: string;
    offset: readonly [number, number];
    universe: string;
}

export const timelineBranches: readonly TimelineBranch[] = [
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-3.3, 2.8],
        universe: "Earth-96283",
    },
    {
        cardDepthOffset: 1.7,
        mergeBefore: "spider-man-no-way-home",
        offset: [-6.9, 5.6],
        universe: "Earth-120703",
    },
];
