import { describe, expect, test } from "bun:test";
import { chronology } from "../data/chronology";
import { timelineBranches } from "../data/timeline-branches";
import { emptyTimelineFilters, filterTimeline, timelineNodePosition } from "./timeline";
import { createTimelineLayout } from "./timeline-layout";

const entries = filterTimeline(chronology, emptyTimelineFilters);
const sony = entries.filter((entry) => entry.universe === "Earth-96283");

describe("timeline branches", () => {
    test("adds the entire Fox branch at Deadpool & Wolverine without moving MCU or Sony geometry", () => {
        const foxEntries = entries.filter((entry) => entry.universe === "Earth-10005");
        const previous = createTimelineLayout(
            entries.filter((entry) => entry.universe !== "Earth-10005")
        );
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered);
            const fox = layout.streams.find((stream) => stream.id === "Earth-10005");
            expect(fox?.entries).toEqual(
                ordered.filter((entry) => entry.universe === "Earth-10005")
            );
            const [main] = layout.streams;
            const crossover = main.entries.findIndex(
                (entry) => entry.slug === "deadpool-and-wolverine"
            );
            expect(fox?.points.at(-1)).toEqual(
                main.curve.getPoint((crossover - 0.5) / (main.points.length - 1))
            );
            expect(main.entries.some((entry) => entry.universe === "Earth-10005")).toBe(false);
            if (order === "chronology") {
                for (const stream of previous.streams) {
                    expect(
                        layout.streams.find((item) => item.id === stream.id)?.curve.getPoints(500)
                    ).toEqual(stream.curve.getPoints(500));
                }
            }
        }
        const [foxOnly] = createTimelineLayout(foxEntries).streams;
        expect(foxOnly.points).toHaveLength(13);
        expect(foxOnly.mergeFadeLength).toBeUndefined();
        const single = createTimelineLayout([foxEntries[9]]);
        expect(single.positions).toHaveLength(1);
        expect(single.positions[0].toArray().every(Number.isFinite)).toBe(true);
    });

    test("keeps Fox cards clear of Sony nodes and merge curves, including detached filters", () => {
        for (const subset of [entries, entries.filter((entry) => entry.phase === undefined)]) {
            const layout = createTimelineLayout(subset);
            const fox = layout.streams.find((stream) => stream.id === "Earth-10005");
            expect(fox).toBeDefined();
            const sonyStreams = layout.streams.filter(
                (stream) => stream.id === "Earth-96283" || stream.id === "Earth-120703"
            );
            for (const point of fox?.points.slice(0, fox.entries.length) ?? []) {
                for (const stream of sonyStreams) {
                    const closest = Math.min(
                        ...stream.curve.getPoints(200).map((sample) => sample.distanceTo(point))
                    );
                    expect(closest).toBeGreaterThan(2.4);
                }
            }
        }
    });

    test("preserves every existing main-stream node and curve when adding a branch", () => {
        const mainEntries = entries.filter(
            (entry) => !timelineBranches.some((branch) => branch.universe === entry.universe)
        );
        const layout = createTimelineLayout(entries);
        const original = createTimelineLayout(mainEntries);
        expect(layout.streams[0].points).toEqual(original.positions);
        expect(original.cardDepthOffsets.every((offset) => offset === 0)).toBe(true);
        expect(layout.cardDepthOffsets.filter((offset) => offset !== 0)).toEqual(
            Array.from({ length: 18 }, () => 1.7)
        );
        expect(layout.streams[0].curve.getPoints(500)).toEqual(
            original.streams[0].curve.getPoints(500)
        );
        mainEntries.forEach((_, index) => {
            const point = timelineNodePosition(index, mainEntries.length);
            expect(layout.streams[0].points[index].toArray()).toEqual([point.x, point.y, point.z]);
        });
    });

    test("merges into the real main curve immediately before No Way Home with forward flow", () => {
        const { streams } = createTimelineLayout(entries);
        const [main, branch] = streams;
        const crossover = main.entries.findIndex(
            (entry) => entry.slug === "spider-man-no-way-home"
        );
        expect(branch.points.at(-1)).toEqual(
            main.curve.getPoint((crossover - 0.5) / (main.points.length - 1))
        );
        expect(branch.nodePointIndices).toEqual([0, 1, 2]);
        expect(branch.points[2].x).toBeLessThan(branch.curve.getPoint(1).x);
        expect(branch.entries).toEqual(sony);
        for (const stream of streams) {
            const samples = stream.curve.getPoints(1000);
            expect(samples.every((point) => point.toArray().every(Number.isFinite))).toBe(true);
            expect(
                samples.every((point, index) => index === 0 || point.x > samples[index - 1].x)
            ).toBe(true);
            stream.nodePointIndices.forEach((pointIndex, index) => {
                expect(
                    stream.curve
                        .getPoint(pointIndex / (stream.points.length - 1))
                        .distanceTo(stream.points[pointIndex])
                ).toBeLessThan(0.000_01);
                expect(stream.entries[index]).toBeDefined();
            });
        }
    });

    test("separates branch cards and nodes in front, side and top/bottom projections", () => {
        const [main, branch] = createTimelineLayout(entries).streams;
        const branchNodes = branch.nodePointIndices.map((index) => branch.points[index]);
        for (const point of branchNodes) {
            for (const mainPoint of main.points) {
                // Card height plus halo/focus margins in front view; width plus plasma
                // clearance along depth in top/bottom views. Side views separate both.
                expect(Math.abs(point.y - mainPoint.y)).toBeGreaterThan(2.6);
                expect(Math.abs(point.z - mainPoint.z)).toBeGreaterThan(2.4);
            }
        }
        branchNodes.slice(1).forEach((point, index) => {
            const previous = branchNodes[index];
            expect(point.x - previous.x).toBeGreaterThan(2.3);
            expect(Math.abs(previous.y - point.y)).toBeLessThan(0.1);
            expect(Math.abs(previous.z - point.z)).toBeLessThan(0.15);
        });
    });

    test("stacks Tobey above Andrew on separate shelves with one shared crossover", () => {
        const [main, tobey, andrew] = createTimelineLayout(entries).streams;
        expect(andrew.id).toBe("Earth-120703");
        expect(andrew.entries.map((entry) => entry.placement)).toEqual(["2012", "2014"]);
        expect(andrew.points.at(-1)).toEqual(tobey.points.at(-1));
        expect(main.entries.some((entry) => entry.universe === andrew.id)).toBe(false);
        for (const upper of tobey.points.slice(0, tobey.entries.length)) {
            for (const lower of andrew.points.slice(0, andrew.entries.length)) {
                // The approved tighter rows still clear the 1.86-unit card height
                // with more than half a unit left for borders and node connectors.
                expect(upper.y - lower.y).toBeGreaterThan(2.4);
                expect(lower.z - upper.z).toBeGreaterThan(2.6);
            }
        }
        for (const stream of [tobey, andrew]) {
            const lastNode = stream.points[stream.entries.length - 1];
            const bend = stream.points[stream.entries.length];
            expect(bend.x - lastNode.x).toBeGreaterThan(1.2);
            expect(Math.abs(bend.y - lastNode.y)).toBeLessThan(0.1);
        }
    });

    test("joins along the main tangent and fades only connected branch endpoints", () => {
        const [main, ...branches] = createTimelineLayout(entries).streams;
        expect(main.mergeFadeLength).toBeUndefined();
        for (const branch of branches) {
            const config = timelineBranches.find((item) => item.universe === branch.id);
            const crossover = main.entries.findIndex((entry) => entry.slug === config?.mergeBefore);
            const tangent = main.curve.getTangent((crossover - 0.5) / (main.points.length - 1));
            expect(branch.curve.getTangent(1).dot(tangent)).toBeGreaterThan(0.999);
            expect(branch.mergeFadeLength).toBe(2);
        }
        const [detached] = createTimelineLayout(sony).streams;
        expect(detached.mergeFadeLength).toBeUndefined();
    });

    test("keeps the release-order crossover immediately before No Way Home", () => {
        const release = filterTimeline(chronology, { ...emptyTimelineFilters, order: "release" });
        const { positions, streams } = createTimelineLayout(release);
        const crossover = streams[0].entries.findIndex(
            (entry) => entry.slug === "spider-man-no-way-home"
        );
        expect(streams[1].points.at(-1)).toEqual(
            streams[0].curve.getPoint((crossover - 0.5) / (streams[0].points.length - 1))
        );
        expect(release.filter((entry) => entry.universe === "Earth-96283")).toEqual(sony);
        expect(
            release.flatMap((entry, index) =>
                entry.universe === "Earth-96283" ? [positions[index]] : []
            )
        ).toEqual(streams[1].points.slice(0, 3));
    });

    test("does not imply a crossover with unrelated titles when No Way Home is filtered out", () => {
        const filtered = entries.filter((entry) => entry.slug !== "spider-man-no-way-home");
        const [, branch] = createTimelineLayout(filtered).streams;
        expect(branch.points).toHaveLength(3);
        expect(branch.curve.getPoint(1).distanceTo(branch.points[2])).toBeLessThan(0.000_01);
    });

    test("supports empty, main-only, branch-only, and single-card filtered views", () => {
        expect(createTimelineLayout([])).toEqual({
            cardDepthOffsets: [],
            positions: [],
            streams: [],
        });
        for (const subset of [[entries[0]], sony, [sony[1]], [entries[4], sony[2]]]) {
            const layout = createTimelineLayout(subset);
            expect(layout.positions).toHaveLength(subset.length);
            expect(layout.positions.every((point) => point.toArray().every(Number.isFinite))).toBe(
                true
            );
            expect(layout.streams.flatMap((stream) => stream.entries)).toHaveLength(subset.length);
        }
    });

    test("uses universe configuration rather than movie slugs to lay out alternate histories", () => {
        const alternate = sony.map((entry, index) => ({
            ...entry,
            slug: `other-${index}`,
            universe: "Earth-123",
        }));
        const { streams } = createTimelineLayout(
            [...entries.slice(0, 5), ...alternate],
            [
                {
                    cardDepthOffset: 1.7,
                    mergeBefore: "captain-marvel",
                    offset: [-3.3, 2.8],
                    universe: "Earth-123",
                },
            ]
        );
        expect(streams[1].entries).toEqual(alternate);
        expect(streams[1].nodePointIndices).toEqual([0, 1, 2]);
    });
});
