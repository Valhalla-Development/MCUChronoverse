export const contentTypes = ["film", "series", "special", "short", "one-shot"] as const;

export type ContentType = (typeof contentTypes)[number];

export const contentTypeLabels: Record<ContentType, string> = {
    film: "Films",
    "one-shot": "One-Shots",
    series: "Series",
    short: "Shorts",
    special: "Specials",
};

export const phases = [
    "Phase One",
    "Phase Two",
    "Phase Three",
    "Phase Four",
    "Phase Five",
    "Phase Six",
] as const;

export type McuPhase = (typeof phases)[number];

export type ContentStatus = "released" | "announced";

export type Saga =
    | "Fantastic Four Universe"
    | "Infinity Saga"
    | "Multiverse Saga"
    | "Sony Spider-Man Universe"
    | "Fox X-Men Universe";

export interface CreditScenesInfo {
    after: boolean;
    during: boolean;
}

export interface TimelineEntry {
    chronologyOrder: number;
    contentType: ContentType;
    creditScenes?: CreditScenesInfo;
    description: string;
    genres?: string[];
    imdbUrl?: string;
    note?: string;
    phase?: McuPhase;
    placement: string;
    posterUrl?: string;
    rating?: number;
    /** Other histories represented by a shared story or a time-travel junction. */
    relatedUniverses?: readonly string[];
    releaseDate: string;
    runtime: string;
    saga: Saga;
    slug: string;
    status: ContentStatus;
    timelineRole?: "shared" | "junction";
    title: string;
    traktUrl: string;
    universe: string;
}
