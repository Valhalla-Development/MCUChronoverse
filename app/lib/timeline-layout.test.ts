import { describe, expect, test } from "bun:test";
import { chronology } from "../data/chronology";
import { timelineBranches } from "../data/timeline-branches";
import { emptyTimelineFilters, filterTimeline, timelineNodePosition } from "./timeline";
import { createTimelineLayout } from "./timeline-layout";

const entries = filterTimeline(chronology, emptyTimelineFilters);
const sony = entries.filter((entry) => entry.universe === "Earth-96283");

describe("timeline branches", () => {
    test("merges each relocated season at its original chronological destination", () => {
        const destinations = [
            ["loki-season-1", "wandavision"],
            ["what-if-season-1", "wandavision"],
            ["marvel-zombies", "wandavision"],
            ["loki-season-2", "agatha-all-along"],
            ["what-if-season-2", "agatha-all-along"],
            ["what-if-season-3", "daredevil-born-again-season-1"],
            ["the-fantastic-four-first-steps", "wonder-man"],
        ];
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered);
            const [main] = layout.streams;
            for (const [slug, destination] of destinations) {
                const stream = layout.streams.find((item) =>
                    item.entries.some((entry) => entry.slug === slug)
                );
                const index = main.entries.findIndex((entry) => entry.slug === destination);
                expect(index).toBeGreaterThan(0);
                expect(stream?.points.at(-1)).toEqual(
                    main.curve.getPoint((index - 0.5) / (main.points.length - 1))
                );
                const filtered = createTimelineLayout(
                    ordered.filter((entry) => entry.slug !== destination)
                );
                expect(
                    filtered.streams.find((item) => item.id === stream?.id)?.mergeFadeLength
                ).toBeUndefined();
            }
            const pending = layout.streams.find((stream) => stream.entries[0]?.universe === "TBD");
            expect(pending?.points.at(-1)).toEqual(main.points.at(-1));
            const lastNode = main.points[main.nodePointIndices.at(-1) ?? 0];
            expect(pending?.points[0].x).toBeGreaterThan(lastNode.x);
        }
    });
    test("keeps every non-616 entry on a labelled stream in either viewing order", () => {
        const expected = new Map([
            ["TVA / Multiverse", ["loki-season-1", "loki-season-2"]],
            ["Multiverse", ["what-if-season-1", "what-if-season-2", "what-if-season-3"]],
            ["Earth-89521", ["marvel-zombies"]],
            ["Earth-828", ["the-fantastic-four-first-steps"]],
            ["TBD", ["avengers-secret-wars"]],
        ]);
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered);
            const [main] = layout.streams;
            expect(main.universeMarker).toBe("Earth-616");
            expect(main.entries).toHaveLength(77);
            expect(main.entries.every((entry) => entry.universe === "Earth-616")).toBe(true);
            expect(layout.streams.flatMap((stream) => stream.entries)).toHaveLength(104);
            for (const [universe, slugs] of expected) {
                const streams = layout.streams.filter(
                    (item) => item.entries[0]?.universe === universe
                );
                expect(
                    streams.flatMap((stream) => stream.entries.map((entry) => entry.slug))
                ).toEqual(slugs);
                for (const stream of streams) {
                    expect(stream.universeMarker).toBeTruthy();
                    expect(stream.mergeFadeLength).toBe(2);
                }
            }
            for (const stream of layout.streams) {
                stream.entries.forEach((entry, index) => {
                    expect(layout.positions[ordered.indexOf(entry)]).toEqual(
                        stream.points[stream.nodePointIndices[index]]
                    );
                });
            }
        }
    });

    test("renders every universe search and single-card filter without orphaning entries", () => {
        for (const query of new Set(entries.map((entry) => entry.universe))) {
            const filtered = filterTimeline(chronology, { ...emptyTimelineFilters, query });
            const layout = createTimelineLayout(filtered);
            expect(layout.positions).toHaveLength(filtered.length);
            expect(new Set(layout.streams.map((stream) => stream.id)).size).toBe(
                layout.streams.length
            );
            expect(layout.streams.flatMap((stream) => stream.entries)).toHaveLength(
                filtered.length
            );
            const isolated = createTimelineLayout(
                entries.filter((entry) => entry.universe === query)
            );
            expect(isolated.streams.every((stream) => stream.mergeFadeLength === undefined)).toBe(
                true
            );
            expect(new Set(isolated.positions.map((point) => point.toArray().join(","))).size).toBe(
                isolated.positions.length
            );
        }
        for (const entry of entries) {
            const layout = createTimelineLayout([entry]);
            expect(layout.positions[0].toArray().every(Number.isFinite)).toBe(true);
            expect(layout.streams[0].entries).toEqual([entry]);
        }
        expect(() => createTimelineLayout([{ ...sony[0], universe: "Unconfigured" }])).toThrow(
            "Missing timeline branch"
        );
    });
    test("anchors an independent single-title stream without implying a crossover", () => {
        const alternate = { ...sony[0], universe: "Outside time" };
        const layout = createTimelineLayout(
            [entries[0], alternate],
            [
                {
                    anchorBefore: entries[0].slug,
                    cardDepthOffset: 1.7,
                    markerCaption: "OUTSIDE TIME",
                    markerTitle: "TVA",
                    offset: [3.8, -2.8],
                    showUniverseMarker: true,
                    universe: alternate.universe,
                },
            ]
        );
        const [, stream] = layout.streams;
        expect(stream.curve.getLength()).toBeGreaterThan(1);
        expect(stream.entries).toEqual([alternate]);
        expect(stream.nodePointIndices).toEqual([0]);
        expect(stream.mergeFadeLength).toBeUndefined();
        expect(stream.universeMarker).toBe("TVA");
        expect(stream.markerCaption).toBe("OUTSIDE TIME");
        expect(stream.points[0].y - layout.positions[0].y).toBeCloseTo(3.8);
    });
    test("connects the original Fox history to the reset without changing navigation order", () => {
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered, [...timelineBranches].reverse());
            const original = layout.streams.find((stream) => stream.id === "Earth-41578");
            const revised = layout.streams.find((stream) => stream.id === "Earth-10005");
            if (!(original && revised)) {
                throw new Error("Both Fox histories must be rendered");
            }
            const reset = revised.entries.findIndex(
                (entry) => entry.slug === "x-men-days-of-future-past-2014"
            );
            expect(original.entries).toHaveLength(5);
            expect(original.points.at(-1)).toEqual(
                revised.curve.getPoint(Math.max(reset - 0.5, 0) / (revised.points.length - 1))
            );
            expect(original.universeMarker).toBe("Earth-41578");
            expect(revised.universeMarker).toBe("Earth-10005");
            expect(layout.positions).toHaveLength(ordered.length);
            expect(
                new Set(
                    layout.streams.flatMap((stream) => stream.entries.map((entry) => entry.slug))
                ).size
            ).toBe(ordered.length);
            original.entries.forEach((entry, index) => {
                expect(layout.positions[ordered.indexOf(entry)]).toEqual(original.points[index]);
                const nearest = Math.min(
                    ...revised.curve
                        .getPoints(200)
                        .map((point) => point.distanceTo(original.points[index]))
                );
                expect(nearest).toBeGreaterThan(2.4);
            });
            const filtered = createTimelineLayout(
                ordered.filter((entry) => entry.slug !== "x-men-days-of-future-past-2014")
            );
            expect(
                filtered.streams.find((stream) => stream.id === "Earth-41578")?.mergeFadeLength
            ).toBeUndefined();
        }
    });
    test("forks the shared Fox past into both histories without duplicate cards", () => {
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered);
            const shared = layout.streams.find((stream) => stream.id === "Shared Fox history");
            const revised = layout.streams.find((stream) => stream.id === "Earth-10005");
            const [fork] = layout.connections;
            if (!(shared && revised && fork)) {
                throw new Error("Shared past must connect to the revised history");
            }
            expect(shared.entries.map((entry) => entry.slug)).toEqual(["x-men-first-class-2011"]);
            expect(fork.points[0]).toEqual(shared.points[0]);
            const reset = revised.entries.findIndex((entry) => entry.timelineRole === "junction");
            expect(fork.points.at(-1)).toEqual(
                revised.curve.getPoint(Math.max(reset - 0.5, 0) / (revised.points.length - 1))
            );
            expect(
                fork.curve.getPoints(200).every((point) => point.toArray().every(Number.isFinite))
            ).toBe(true);
            expect(revised.connectionLabel).toBe("VIEWING ORDER");
            for (const slug of ["x-men-first-class-2011", "x-men-days-of-future-past-2014"]) {
                expect(
                    createTimelineLayout(ordered.filter((entry) => entry.slug !== slug)).connections
                ).toHaveLength(0);
            }
            const hiddenDestination = createTimelineLayout(
                ordered.filter((entry) => entry.slug !== "avengers-doomsday")
            );
            expect(
                hiddenDestination.streams.find((stream) => stream.id === revised.id)
                    ?.connectionLabel
            ).toBeUndefined();
        }
    });
    test("joins the Fox viewing sequence before Doomsday without changing its home reality", () => {
        const foxEntries = entries.filter((entry) => entry.universe === "Earth-10005");
        const previous = createTimelineLayout(
            entries.filter(
                (entry) =>
                    !["Earth-10005", "Earth-41578", "Shared Fox history"].includes(entry.universe)
            )
        );
        for (const order of ["chronology", "release"] as const) {
            const ordered = filterTimeline(chronology, { ...emptyTimelineFilters, order });
            const layout = createTimelineLayout(ordered);
            const fox = layout.streams.find((stream) => stream.id === "Earth-10005");
            expect(fox?.entries).toEqual(
                ordered.filter((entry) => entry.universe === "Earth-10005")
            );
            const [main] = layout.streams;
            expect(fox?.entries.some((entry) => entry.slug === "deadpool-and-wolverine")).toBe(
                true
            );
            expect(fox?.mergeFadeLength).toBe(2);
            expect(fox?.points).toHaveLength(14);
            const doomsday = main.entries.findIndex((entry) => entry.slug === "avengers-doomsday");
            expect(fox?.points.at(-1)).toEqual(
                main.curve.getPoint((doomsday - 0.5) / (main.points.length - 1))
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
        expect(foxOnly.points).toHaveLength(8);
        expect(foxOnly.mergeFadeLength).toBeUndefined();
        const single = createTimelineLayout([foxEntries[0]]);
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
        expect(layout.streams[0].points.slice(0, mainEntries.length)).toEqual(original.positions);
        expect(original.cardDepthOffsets.every((offset) => offset === 0)).toBe(true);
        expect(layout.cardDepthOffsets.filter((offset) => offset !== 0)).toEqual(
            Array.from({ length: 27 }, () => 1.7)
        );
        const withoutTail = createTimelineLayout(
            entries.filter((entry) => entry.universe !== "TBD")
        );
        expect(withoutTail.streams[0].curve.getPoints(500)).toEqual(
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

    test("joins along the target tangent and fades only connected branch endpoints", () => {
        const [main, ...branches] = createTimelineLayout(entries).streams;
        expect(main.mergeFadeLength).toBeUndefined();
        for (const branch of branches) {
            const config = timelineBranches.find(
                (item) => (item.id ?? item.universe) === branch.id
            );
            if (!(config?.mergeBefore || config?.mergeAfter)) {
                expect(branch.mergeFadeLength).toBeUndefined();
                expect(branch.points).toHaveLength(branch.entries.length + 1);
                continue;
            }
            const target = config?.mergeIntoUniverse
                ? branches.find((item) => item.id === config.mergeIntoUniverse)
                : main;
            if (!target) {
                throw new Error("Connection target must exist");
            }
            const crossover = target.entries.findIndex(
                (entry) => entry.slug === config?.mergeBefore
            );
            const tangent = target.curve.getTangent(
                config.mergeAfter ? 1 : Math.max(crossover - 0.5, 0) / (target.points.length - 1)
            );
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
            connections: [],
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
