import {
    type ContentType,
    contentTypes,
    type McuPhase,
    phases,
    type TimelineEntry,
} from "../data/types";

export const timelineOrders = ["chronology", "release"] as const;

export type TimelineOrder = (typeof timelineOrders)[number];

export const phaseFilters = [...phases, "Outside MCU phases"] as const;
export type TimelinePhaseFilter = McuPhase | "Outside MCU phases";

export interface TimelineFilters {
    order: TimelineOrder;
    phases: TimelinePhaseFilter[];
    query: string;
    types: ContentType[];
}

export const emptyTimelineFilters: TimelineFilters = {
    order: "chronology",
    phases: [],
    query: "",
    types: [],
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
                filters.phases.includes(entry.phase ?? "Outside MCU phases");
            return matchesQuery && matchesType && matchesPhase;
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
