import { describe, expect, test } from "bun:test";
import { chronology } from "../data/chronology";
import { emptyTimelineFilters, filterTimeline, timelineNodePosition } from "./timeline";
import { createTimelineLayout } from "./timeline-layout";

const entries = filterTimeline(chronology, emptyTimelineFilters);
const sony = entries.filter((entry) => entry.universe === "Earth-96283");

describe("timeline branches", () => {
    test("preserves every existing main-stream node and curve when adding a branch", () => {
        const mainEntries = entries.filter((entry) => entry.universe !== "Earth-96283");
        const layout = createTimelineLayout(entries);
        const original = createTimelineLayout(mainEntries);
        expect(layout.streams[0].points).toEqual(original.positions);
        expect(original.cardDepthOffsets.every((offset) => offset === 0)).toBe(true);
        expect(layout.cardDepthOffsets.filter((offset) => offset !== 0)).toEqual([1.7, 1.7, 1.7]);
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
            expect(previous.z - point.z).toBeGreaterThan(1.8);
        });
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
        expect(release.slice(0, 3)).toEqual(sony);
        expect(positions.slice(0, 3)).toEqual(streams[1].points.slice(0, 3));
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
