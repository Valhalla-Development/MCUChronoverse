import {
    type ContentType,
    contentTypes,
    type McuPhase,
    phases,
    type TimelineEntry,
} from "../data/types";

export const timelineOrders = ["chronology", "release"] as const;

export type TimelineOrder = (typeof timelineOrders)[number];

export const phaseFilters = phases;
export type TimelinePhaseFilter = McuPhase;

export const universeFilters = [
    { label: "MCU", value: "mcu" },
    { label: "Sony Spider-Man", value: "sony-spider-man" },
    { label: "Fox X-Men", value: "fox-x-men" },
    { label: "TVA & Multiverse", value: "multiverse" },
    { label: "Marvel Zombies", value: "marvel-zombies" },
    { label: "Fantastic Four", value: "fantastic-four" },
    { label: "Unconfirmed", value: "unconfirmed" },
] as const;
export type TimelineUniverseFilter = (typeof universeFilters)[number]["value"];
const universeFilterValues = universeFilters.map((filter) => filter.value);

export interface TimelineFilters {
    order: TimelineOrder;
    phases: TimelinePhaseFilter[];
    query: string;
    types: ContentType[];
    universes: TimelineUniverseFilter[];
}

export const emptyTimelineFilters: TimelineFilters = {
    order: "chronology",
    phases: [],
    query: "",
    types: [],
    universes: [],
};

export function isWatchable(entry: TimelineEntry) {
    return entry.status === "released";
}

interface SearchParamsReader {
    get: (name: string) => string | null;
}

function parseList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
    if (!value) {
        return [];
    }
    const allowedSet = new Set<string>(allowed);
    return value.split(",").filter((item): item is T => allowedSet.has(item));
}

export function parseTimelineFilters(params: SearchParamsReader): TimelineFilters {
    const order = params.get("order");
    return {
        order: order === "release" ? order : "chronology",
        phases: parseList(params.get("phases"), phaseFilters),
        query: params.get("q")?.trim() ?? "",
        types: parseList(params.get("types"), contentTypes),
        universes: parseList(params.get("universes"), universeFilterValues),
    };
}

export function serializeTimelineFilters(filters: TimelineFilters): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.order !== "chronology") {
        params.set("order", filters.order);
    }
    if (filters.query.trim()) {
        params.set("q", filters.query.trim());
    }
    if (filters.types.length > 0) {
        params.set("types", filters.types.join(","));
    }
    if (filters.phases.length > 0) {
        params.set("phases", filters.phases.join(","));
    }
    if (filters.universes.length > 0) {
        params.set("universes", filters.universes.join(","));
    }
    return params;
}

export function filterTimeline(
    entries: readonly TimelineEntry[],
    filters: TimelineFilters
): TimelineEntry[] {
    const query = filters.query.trim().toLocaleLowerCase("en-GB");
    return entries
        .filter((entry) => {
            const matchesQuery =
                query.length === 0 ||
                entry.title.toLocaleLowerCase("en-GB").includes(query) ||
                entry.description.toLocaleLowerCase("en-GB").includes(query) ||
                entry.universe.toLocaleLowerCase("en-GB").includes(query) ||
                entry.saga.toLocaleLowerCase("en-GB").includes(query);
            const matchesType =
                filters.types.length === 0 || filters.types.includes(entry.contentType);
            const matchesPhase =
                filters.phases.length === 0 ||
                (entry.phase !== undefined && filters.phases.includes(entry.phase));
            const matchesUniverse =
                filters.universes.length === 0 ||
                filters.universes.includes(universeFilterForEntry(entry));
            return matchesQuery && matchesType && matchesPhase && matchesUniverse;
        })
        .sort((left, right) => {
            if (filters.order === "release") {
                return (
                    left.releaseDate.localeCompare(right.releaseDate) ||
                    left.chronologyOrder - right.chronologyOrder
                );
            }
            return left.chronologyOrder - right.chronologyOrder;
        });
}

export function universeFilterForEntry(entry: TimelineEntry): TimelineUniverseFilter {
    if (entry.universe === "Earth-616") {
        return "mcu";
    }
    if (["Earth-96283", "Earth-120703"].includes(entry.universe)) {
        return "sony-spider-man";
    }
    if (["Earth-10005", "Earth-41578"].includes(entry.universe)) {
        return "fox-x-men";
    }
    if (entry.universe === "Earth-89521") {
        return "marvel-zombies";
    }
    if (entry.universe === "Earth-828") {
        return "fantastic-four";
    }
    if (entry.universe === "TBD") {
        return "unconfirmed";
    }
    return "multiverse";
}

export interface TimelineNodePosition {
    x: number;
    y: number;
    z: number;
}

export function timelineNodePosition(index: number, count: number): TimelineNodePosition {
    const safeCount = Math.max(count, 1);
    const centre = (safeCount - 1) / 2;
    const offset = index - centre;
    return {
        x: offset * 2.2,
        y: Math.sin(index * 0.73) * 0.16 + Math.sin(index * 0.19) * 0.09,
        z: Math.cos(index * 0.47) * 0.13 + Math.sin(index * 0.16) * 0.07,
    };
}
