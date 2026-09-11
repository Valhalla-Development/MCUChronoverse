import { CatmullRomCurve3, type Curve, LineCurve3, Vector3 } from "three";
import { type TimelineBranch, timelineBranches } from "../data/timeline-branches";
import type { TimelineEntry } from "../data/types";
import { timelineNodePosition } from "./timeline";

export interface TimelineStream {
    curve: Curve<Vector3>;
    entries: readonly TimelineEntry[];
    id: string;
    mergeFadeLength?: number;
    nodePointIndices: number[];
    points: Vector3[];
}

export interface TimelineLayout {
    cardDepthOffsets: number[];
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

function branchJunction(main: TimelineStream, mergeBefore: string): Vector3 | undefined {
    const index = main.entries.findIndex((entry) => entry.slug === mergeBefore);
    if (index < 0) {
        return undefined;
    }
    // The same crossover remains the anchor in chronology and release order.
    return main.curve.getPoint(Math.max(index - 0.5, 0) / Math.max(main.points.length - 1, 1));
}

export function createTimelineLayout(
    entries: readonly TimelineEntry[],
    branches: readonly TimelineBranch[] = timelineBranches
): TimelineLayout {
    const branchUniverses = new Set(branches.map((branch) => branch.universe));
    const mainEntries = entries.filter((entry) => !branchUniverses.has(entry.universe));
    const mainPoints = mainEntries.map((_, index) => {
        const point = timelineNodePosition(index, mainEntries.length);
        return new Vector3(point.x, point.y, point.z);
    });
    const main: TimelineStream = {
        curve: createTimelineCurve(mainPoints),
        entries: mainEntries,
        id: "main",
        nodePointIndices: mainEntries.map((_, index) => index),
        points: mainPoints,
    };
    const streams = mainEntries.length ? [main] : [];
    for (const branch of branches) {
        const branchEntries = entries.filter((entry) => entry.universe === branch.universe);
        if (!branchEntries.length) {
            continue;
        }
        const junction = branchJunction(main, branch.mergeBefore);
        const origin = junction ?? new Vector3(4.4, 0, 0);
        const [offsetY, offsetZ] = branch.offset;
        // Keep each universe on a nearly horizontal shelf. A card-free lead-out
        // bends toward the crossover; increasing x preserves plasma volume sampling.
        const points = branchEntries.map((_, index) => {
            const distance = branchEntries.length - 1 - index;
            return origin
                .clone()
                .add(
                    new Vector3(
                        -6.5 - distance * 2.5,
                        offsetY + Math.sin(distance * 0.8) * 0.08,
                        offsetZ + Math.sin(distance * 0.7) * 0.12
                    )
                );
        });
        if (junction) {
            // Hide the merge when its target is filtered out, rather than imply a
            // crossover with an unrelated visible title. The Sony stream stays separate.
            const crossover = main.entries.findIndex((entry) => entry.slug === branch.mergeBefore);
            const tangent = main.curve.getTangent(
                Math.max(crossover - 0.5, 0) / Math.max(main.points.length - 1, 1)
            );
            // Approach along the main tangent so the join cannot hook above the stream.
            points.push(
                junction.clone().add(new Vector3(-5.2, offsetY, offsetZ)),
                junction.clone().add(new Vector3(-2.5, offsetY * 0.5, offsetZ * 0.5)),
                junction.clone().add(new Vector3(-1.5, offsetY * 0.12, offsetZ * 0.12)),
                junction.clone().addScaledVector(tangent, -0.75),
                junction.clone().addScaledVector(tangent, -0.35),
                junction
            );
        }
        streams.push({
            curve: createTimelineCurve(points),
            entries: branchEntries,
            id: branch.universe,
            mergeFadeLength: junction ? 2 : undefined,
            nodePointIndices: branchEntries.map((_, index) => index),
            points,
        });
    }
    const positionsBySlug = new Map<string, Vector3>();
    for (const stream of streams) {
        stream.entries.forEach((entry, index) => {
            positionsBySlug.set(entry.slug, stream.points[stream.nodePointIndices[index]]);
        });
    }
    return {
        cardDepthOffsets: entries.map(
            (entry) =>
                branches.find((branch) => branch.universe === entry.universe)?.cardDepthOffset ?? 0
        ),
        positions: entries.map((entry) => positionsBySlug.get(entry.slug) as Vector3),
        streams,
    };
}
