import {
    CatmullRomCurve3,
    CubicBezierCurve3,
    type Curve,
    CurvePath,
    LineCurve3,
    Vector3,
} from "three";
import { type TimelineBranch, timelineBranches } from "../data/timeline-branches";
import type { TimelineEntry } from "../data/types";
import { timelineNodePosition } from "./timeline";

export interface TimelineStream {
    curve: Curve<Vector3>;
    entries: readonly TimelineEntry[];
    id: string;
    markerCaption?: string;
    mergeFadeLength?: number;
    nodePointIndices: number[];
    points: Vector3[];
    universeMarker?: string;
}

export interface TimelineLayout {
    cardDepthOffsets: number[];
    connections: TimelineStream[];
    positions: Vector3[];
    streams: TimelineStream[];
}

function createTimelineCurve(points: readonly Vector3[]): Curve<Vector3> {
    const first = points[0] ?? new Vector3(-2, 0, 0);
    const last = points.at(-1) ?? new Vector3(2, 0, 0);
    if (points.length < 3) {
        return new LineCurve3(
            first,
            last.equals(first) ? first.clone().add(new Vector3(0.001, 0, 0)) : last
        );
    }
    return new CatmullRomCurve3([...points], false, "catmullrom", 0.42);
}

function branchJunction(main: TimelineStream, mergeBefore?: string): Vector3 | undefined {
    const index = main.entries.findIndex((entry) => entry.slug === mergeBefore);
    const nodePointIndex = main.nodePointIndices.at(index);
    if (index < 0 || nodePointIndex === undefined) {
        return undefined;
    }
    // The same crossover remains the anchor in chronology and release order.
    return main.curve.getPoint(
        Math.max(nodePointIndex - 0.5, 0) / Math.max(main.points.length - 1, 1)
    );
}

function orderBranches(branches: readonly TimelineBranch[]): TimelineBranch[] {
    // Build parent streams first even when configuration is reordered.
    const pending = [...branches];
    const ordered: TimelineBranch[] = [];
    while (pending.length) {
        const index = pending.findIndex(
            (branch) => !pending.some((parent) => parent.universe === branch.mergeIntoUniverse)
        );
        if (index < 0) {
            throw new Error("Timeline branch connections must not contain cycles");
        }
        ordered.push(...pending.splice(index, 1));
    }
    return ordered;
}

function createBranchPoints(branch: TimelineBranch, count: number, origin: Vector3): Vector3[] {
    const [offsetY, offsetZ] = branch.offset;
    // Nearly horizontal shelves leave the approach to a crossover free of cards.
    const points = Array.from({ length: count }, (_, index) => {
        const distance = count - 1 - index;
        return origin
            .clone()
            .add(
                new Vector3(
                    (branch.mergeBefore || branch.mergeAfter ? -6.5 : 0) - distance * 2.5,
                    offsetY + Math.sin(distance * 0.8) * 0.08,
                    offsetZ + Math.sin(distance * 0.7) * 0.12
                )
            );
    });
    // Independent single-title universes still need a visible line beyond the node.
    const last = points.at(-1);
    if (!(branch.mergeBefore || branch.mergeAfter) && last) {
        points.push(last.clone().add(new Vector3(1.25, 0, 0)));
    }
    return points;
}

function entriesForBranch(
    entries: readonly TimelineEntry[],
    branch: TimelineBranch
): TimelineEntry[] {
    return entries.filter(
        (entry) =>
            entry.universe === branch.universe &&
            (!branch.entrySlugs || branch.entrySlugs.includes(entry.slug))
    );
}

function mergeProgress(target: TimelineStream, branch: TimelineBranch): number | undefined {
    if (branch.mergeAtStart) {
        return target.entries.length ? 0 : undefined;
    }
    if (branch.mergeAfter) {
        return target.entries.at(-1)?.slug === branch.mergeAfter ? 1 : undefined;
    }
    const index = target.entries.findIndex((entry) => entry.slug === branch.mergeBefore);
    const nodePointIndex = target.nodePointIndices.at(index);
    return index < 0 || nodePointIndex === undefined
        ? undefined
        : Math.max(nodePointIndex - 0.5, 0) / Math.max(target.points.length - 1, 1);
}

function extendMainStream(
    points: Vector3[],
    mainEntries: readonly TimelineEntry[],
    entries: readonly TimelineEntry[],
    branches: readonly TimelineBranch[]
): void {
    const finalMain = mainEntries.at(-1);
    const tail = branches.some(
        (branch) =>
            branch.mergeAfter &&
            branch.mergeAfter === finalMain?.slug &&
            entriesForBranch(entries, branch).length > 0
    );
    const last = points.at(-1);
    if (tail && last) {
        // Regularly spaced support points keep the continuation monotonic for plasma sampling.
        for (let step = 1; step <= 7; step += 1) {
            points.push(last.clone().add(new Vector3(step * 2, 0, 0)));
        }
    }
}

function connectionTo(target: TimelineStream | undefined, branch: TimelineBranch) {
    const progress = target ? mergeProgress(target, branch) : undefined;
    if (!target || progress === undefined) {
        return;
    }
    return {
        point: target.curve.getPoint(progress),
        tangent: target.curve.getTangent(progress),
    };
}

function createHistoryConnections(
    streams: readonly TimelineStream[],
    branches: readonly TimelineBranch[]
): TimelineStream[] {
    return branches.flatMap((branch) => {
        if (!(branch.forkBefore && branch.forkIntoUniverse)) {
            return [];
        }
        const source = streams.find((stream) => stream.id === (branch.id ?? branch.universe));
        const target = streams.find((stream) => stream.id === branch.forkIntoUniverse);
        const destination = connectionTo(target, {
            ...branch,
            mergeAfter: undefined,
            mergeAtStart: false,
            mergeBefore: branch.forkBefore,
        });
        if (!(source && destination)) {
            // A filtered-out shared past or reset must not leave a dangling connection.
            return [];
        }
        const start = source.points.at(source.nodePointIndices.at(-1) ?? 0);
        if (!start) {
            return [];
        }
        const end = destination.point;
        // Bezier handles keep the fork monotonic without the small backward hook
        // a Catmull-Rom transition can introduce at a level starting tangent.
        const shelf = end.clone();
        shelf.x = start.x + Math.min(5, (end.x - start.x) * 0.5);
        const curve = new CurvePath<Vector3>();
        curve.add(
            new CubicBezierCurve3(
                start.clone(),
                start.clone().add(new Vector3(2, 0, 0)),
                shelf.clone().add(new Vector3(-2, 0, 0)),
                shelf
            )
        );
        curve.add(
            new CubicBezierCurve3(
                shelf,
                shelf.clone().lerp(end, 0.5),
                end.clone().addScaledVector(destination.tangent, -0.75),
                end
            )
        );
        const points = curve.getPoints(Math.max(8, Math.ceil(start.distanceTo(end))));
        return [
            {
                curve,
                entries: [],
                id: `${source.id}:fork`,
                mergeFadeLength: 2,
                nodePointIndices: [],
                points,
            },
        ];
    });
}

function separateDetachedPoints(
    points: Vector3[],
    streams: readonly TimelineStream[],
    junction?: Vector3
): void {
    if (junction) {
        return;
    }
    const occupied = streams.flatMap((stream) =>
        stream.nodePointIndices.flatMap((index) => {
            const point = stream.points.at(index);
            return point ? [point] : [];
        })
    );
    // Missing destinations use fallback shelves. Move only those shelves, keeping
    // connected streams and the main timeline fixed when filters change.
    let collision = true;
    while (collision) {
        collision = false;
        for (const point of points) {
            const obstacle = occupied.find(
                (other) =>
                    Math.abs(point.x - other.x) < 2.5 &&
                    Math.abs(point.y - other.y) < 2.2 &&
                    Math.abs(point.z - other.z) < 2.2
            );
            if (obstacle) {
                const shift = obstacle.x - Math.max(...points.map((item) => item.x)) - 2.6;
                for (const item of points) {
                    item.x += shift;
                }
                collision = true;
                break;
            }
        }
    }
}

function validateAssignedUniverses(
    entries: readonly TimelineEntry[],
    branches: readonly TimelineBranch[]
): void {
    const branchUniverses = new Set(branches.map((branch) => branch.universe));
    const unassigned = entries.find(
        (entry) => entry.universe !== "Earth-616" && !branchUniverses.has(entry.universe)
    );
    if (unassigned) {
        throw new Error(`Missing timeline branch for ${unassigned.universe}`);
    }
}

function createMainStream(
    entries: readonly TimelineEntry[],
    branches: readonly TimelineBranch[]
): TimelineStream {
    const branchUniverses = new Set(branches.map((branch) => branch.universe));
    const mainEntries = entries.filter((entry) => !branchUniverses.has(entry.universe));
    const mainPoints = mainEntries.map((_, index) => {
        const point = timelineNodePosition(index, mainEntries.length);
        return new Vector3(point.x, point.y, point.z);
    });
    // Reserve a card-free continuation for entries after the last known Earth-616 story.
    extendMainStream(mainPoints, mainEntries, entries, branches);
    return {
        curve: createTimelineCurve(mainPoints),
        entries: mainEntries,
        id: "main",
        nodePointIndices: mainEntries.map((_, index) => index),
        points: mainPoints,
        universeMarker: "Earth-616",
    };
}

function appendMergePoints(
    points: Vector3[],
    junction: Vector3,
    tangent: Vector3,
    offset: readonly [number, number]
): void {
    const [offsetY, offsetZ] = offset;
    points.push(
        junction.clone().add(new Vector3(-5.2, offsetY, offsetZ)),
        junction.clone().add(new Vector3(-2.5, offsetY * 0.5, offsetZ * 0.5)),
        junction.clone().add(new Vector3(-1.5, offsetY * 0.12, offsetZ * 0.12)),
        junction.clone().addScaledVector(tangent, -0.75),
        junction.clone().addScaledVector(tangent, -0.35),
        junction
    );
}

function createBranchStream(
    entries: readonly TimelineEntry[],
    branch: TimelineBranch,
    main: TimelineStream,
    streams: readonly TimelineStream[]
): TimelineStream | undefined {
    const branchEntries = entriesForBranch(entries, branch);
    if (!branchEntries.length) {
        return undefined;
    }
    const target = branch.mergeIntoUniverse
        ? streams.find((stream) => stream.id === branch.mergeIntoUniverse)
        : main;
    const connection = connectionTo(target, branch);
    const junction = connection?.point;
    const origin =
        junction ??
        branchJunction(main, branch.anchorBefore) ??
        new Vector3(4.4 + (branch.detachedOffsetX ?? 0), 0, 0);
    const points = createBranchPoints(branch, branchEntries.length, origin);
    separateDetachedPoints(points, streams, junction);
    if (junction && connection) {
        // Approach along the target tangent and hide the merge if the target is filtered out.
        appendMergePoints(points, junction, connection.tangent, branch.offset);
    }
    return {
        curve: createTimelineCurve(points),
        entries: branchEntries,
        id: branch.id ?? branch.universe,
        markerCaption: branch.markerCaption,
        mergeFadeLength: junction ? 2 : undefined,
        nodePointIndices: branchEntries.map((_, index) => index),
        points,
        universeMarker: branch.showUniverseMarker
            ? (branch.markerTitle ?? branch.universe)
            : undefined,
    };
}

function positionsForEntries(
    entries: readonly TimelineEntry[],
    streams: readonly TimelineStream[]
): Vector3[] {
    const positionsBySlug = new Map<string, Vector3>();
    for (const stream of streams) {
        stream.entries.forEach((entry, index) => {
            const position = stream.points.at(stream.nodePointIndices.at(index) ?? -1);
            if (position) {
                positionsBySlug.set(entry.slug, position);
            }
        });
    }
    return entries.map((entry) => {
        const position = positionsBySlug.get(entry.slug);
        if (!position) {
            throw new Error(`Missing timeline position for ${entry.slug}`);
        }
        return position;
    });
}

export function createTimelineLayout(
    entries: readonly TimelineEntry[],
    branches: readonly TimelineBranch[] = timelineBranches
): TimelineLayout {
    validateAssignedUniverses(entries, branches);
    const main = createMainStream(entries, branches);
    const streams: TimelineStream[] = main.entries.length ? [main] : [];
    for (const branch of orderBranches(branches)) {
        const stream = createBranchStream(entries, branch, main, streams);
        if (stream) {
            streams.push(stream);
        }
    }
    return {
        cardDepthOffsets: entries.map(
            (entry) =>
                branches.find((branch) => branch.universe === entry.universe)?.cardDepthOffset ?? 0
        ),
        connections: createHistoryConnections(streams, branches),
        positions: positionsForEntries(entries, streams),
        streams,
    };
}
