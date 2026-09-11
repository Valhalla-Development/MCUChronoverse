/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { chronology, validateChronology } from "../data/chronology";
import {
    emptyTimelineFilters,
    filterTimeline,
    isWatchable,
    parseTimelineFilters,
    serializeTimelineFilters,
    timelineNodePosition,
} from "./timeline";

describe("chronology", () => {
    test("contains valid unique entries", () => {
        expect(validateChronology(chronology)).toEqual([]);
    });

    test("uses contiguous chronological display positions", () => {
        const orders = chronology.map((entry) => entry.chronologyOrder);
        expect(orders).toEqual(chronology.map((_, index) => (index + 1) * 10));
    });
});

describe("Sony chronology", () => {
    test("places the seeded trilogy between Eternals and No Way Home without MCU membership", () => {
        const sony = chronology.filter((entry) => entry.universe === "Earth-96283");
        expect(
            sony.map((entry) => [entry.slug, entry.placement, entry.releaseDate, entry.imdbUrl])
        ).toEqual([
            ["spider-man-2002", "2002", "2002-05-03", "https://www.imdb.com/title/tt0145487/"],
            ["spider-man-2-2004", "2004", "2004-06-30", "https://www.imdb.com/title/tt0316654/"],
            ["spider-man-3-2007", "2007", "2007-05-04", "https://www.imdb.com/title/tt0413300/"],
        ]);
        const ordered = filterTimeline(chronology, emptyTimelineFilters);
        const andrew = chronology.filter((entry) => entry.universe === "Earth-120703");
        expect(
            andrew.map((entry) => [entry.title, entry.placement, entry.releaseDate, entry.imdbUrl])
        ).toEqual([
            [
                "The Amazing Spider-Man",
                "2012",
                "2012-07-03",
                "https://www.imdb.com/title/tt0948470/",
            ],
            [
                "The Amazing Spider-Man 2",
                "2014",
                "2014-05-02",
                "https://www.imdb.com/title/tt1872181/",
            ],
        ]);
        const eternalsIndex = ordered.findIndex((entry) => entry.slug === "eternals");
        expect(ordered.slice(eternalsIndex, eternalsIndex + 7).map((entry) => entry.slug)).toEqual([
            "eternals",
            ...sony.map((entry) => entry.slug),
            ...andrew.map((entry) => entry.slug),
            "spider-man-no-way-home",
        ]);
        const captainIndex = ordered.findIndex((entry) => entry.slug === "captain-marvel");
        expect(ordered[captainIndex + 1].slug).toBe("iron-man");
        for (const entry of [...sony, ...andrew]) {
            expect(entry.phase).toBeUndefined();
            expect(entry.saga).toBe("Sony Spider-Man Universe");
            expect(entry.description.length).toBeGreaterThan(30);
            expect(entry.genres?.length).toBeGreaterThan(0);
            expect(entry.posterUrl?.startsWith("https://image.tmdb.org/t/p/")).toBe(true);
            expect(entry.rating).toBeGreaterThan(0);
            expect(entry.runtime.length).toBeGreaterThan(0);
            expect(entry.traktUrl).toBe(`https://app.trakt.tv/movies/${entry.slug}`);
            expect(isWatchable(entry)).toBe(true);
        }
    });

    test("supports universe search and an explicit non-MCU phase filter", () => {
        const filters = { ...emptyTimelineFilters, query: "Earth-96283" };
        expect(filterTimeline(chronology, filters)).toHaveLength(3);
        expect(filterTimeline(chronology, { ...filters, phases: ["Phase One"] })).toHaveLength(0);
        const outside = { ...emptyTimelineFilters, phases: ["Outside MCU phases"] as const };
        const parsed = parseTimelineFilters(
            serializeTimelineFilters({ ...outside, phases: [...outside.phases] })
        );
        expect(parsed.phases).toEqual([...outside.phases]);
        expect(
            filterTimeline(chronology, { ...parsed, query: "Sony Spider-Man Universe" })
        ).toHaveLength(5);
        expect(
            filterTimeline(chronology, { ...filters, order: "release" }).map(
                (entry) => entry.placement
            )
        ).toEqual(["2002", "2004", "2007"]);
    });

    test("still rejects duplicate ordering and invalid dates", () => {
        expect(
            validateChronology([chronology[0], { ...chronology[0], releaseDate: "invalid" }]).map(
                (issue) => issue.message
            )
        ).toEqual(["Duplicate chronology order 10", "Duplicate slug", "Invalid release date"]);
    });
});

describe("Fox X-Men chronology", () => {
    test("keeps the complete Fox viewing sequence before its crossover, with Logan before both sequels", () => {
        const expected = [
            ["x-men-2000", "tt0120903"],
            ["x2-2003", "tt0290334"],
            ["x-men-the-last-stand-2006", "tt0376994"],
            ["x-men-origins-wolverine-2009", "tt0458525"],
            ["x-men-first-class-2011", "tt1270798"],
            ["the-wolverine-2013", "tt1430132"],
            ["x-men-days-of-future-past-2014", "tt1877832"],
            ["deadpool-2016", "tt1431045"],
            ["x-men-apocalypse-2016", "tt3385516"],
            ["logan-2017", "tt3315342"],
            ["deadpool-2-2018", "tt5463162"],
            ["dark-phoenix-2019", "tt6565702"],
            ["the-new-mutants-2020", "tt4682266"],
        ];
        const ordered = filterTimeline(chronology, emptyTimelineFilters);
        const start = ordered.findIndex((entry) => entry.slug === "what-if-season-2");
        expect(ordered.slice(start, start + 15).map((entry) => entry.slug)).toEqual([
            "what-if-season-2",
            ...expected.map(([slug]) => slug),
            "deadpool-and-wolverine",
        ]);
        const fox = filterTimeline(chronology, {
            ...emptyTimelineFilters,
            query: "Fox X-Men Universe",
        });
        expect(fox.map((entry) => [entry.slug, entry.imdbUrl])).toEqual(
            expected.map(([slug, imdb]) => [slug, `https://www.imdb.com/title/${imdb}/`])
        );
        expect(fox.find((entry) => entry.slug === "logan-2017")?.placement).toBe("2029");
        for (const entry of fox) {
            expect(entry.universe).toBe("Earth-10005");
            expect(entry.phase).toBeUndefined();
            expect(entry.note).toBeTruthy();
            expect(entry.description.length).toBeGreaterThan(30);
            expect(entry.genres?.length).toBeGreaterThan(0);
            expect(entry.posterUrl?.startsWith("https://image.tmdb.org/t/p/")).toBe(true);
            expect(entry.traktUrl.startsWith("https://app.trakt.tv/movies/")).toBe(true);
            expect(entry.rating).toBeGreaterThan(0);
            expect(entry.runtime).toBeTruthy();
            expect(isWatchable(entry)).toBe(true);
        }
        expect(
            filterTimeline(fox, { ...emptyTimelineFilters, phases: ["Phase Five"] })
        ).toHaveLength(0);
        expect(
            filterTimeline(fox, { ...emptyTimelineFilters, phases: ["Outside MCU phases"] })
        ).toHaveLength(13);
    });
});

describe("timeline filters", () => {
    test("filters by search, type, and phase", () => {
        const entries = filterTimeline(chronology, {
            order: "chronology",
            phases: ["Phase One"],
            query: "iron",
            types: ["film"],
        });
        expect(entries.map((entry) => entry.slug)).toEqual(["iron-man", "iron-man-2"]);
    });

    test("ignores unknown URL values", () => {
        const filters = parseTimelineFilters(
            new URLSearchParams("types=film,game&phases=Phase%20One,Phase%20Nine")
        );
        expect(filters.types).toEqual(["film"]);
        expect(filters.phases).toEqual(["Phase One"]);
        expect(filters.order).toBe("chronology");
    });

    test("sorts and serializes release order", () => {
        const entries = filterTimeline(chronology, {
            ...emptyTimelineFilters,
            order: "release",
        });
        const releaseDates = entries.map((entry) => entry.releaseDate);

        expect(releaseDates).toEqual([...releaseDates].sort());
        expect(
            serializeTimelineFilters({ ...emptyTimelineFilters, order: "release" }).toString()
        ).toBe("order=release");
        expect(parseTimelineFilters(new URLSearchParams("order=release")).order).toBe("release");
    });
});

describe("watch availability", () => {
    test("only released entries can be marked watched", () => {
        const released = chronology.find((entry) => entry.status === "released");
        const announced = chronology.find((entry) => entry.status === "announced");

        expect(released && isWatchable(released)).toBe(true);
        expect(announced && isWatchable(announced)).toBe(false);
    });
});

describe("timeline node positioning", () => {
    test("is deterministic and finite", () => {
        const first = timelineNodePosition(3, 12);
        expect(timelineNodePosition(3, 12)).toEqual(first);
        expect(Object.values(first).every(Number.isFinite)).toBe(true);
    });

    test("moves forward from left to right", () => {
        const positions = Array.from({ length: 8 }, (_, index) => timelineNodePosition(index, 8));
        expect(
            positions.every((position, index) => {
                const previous = positions[index - 1];
                return index === 0 || (previous !== undefined && position.x > previous.x);
            })
        ).toBe(true);
    });
});
