import { afterEach, expect, mock, test } from "bun:test";
import { fetchSeededMovieMetadata } from "./tmdb-metadata";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

function mockMovieLookup(imdbId: string, ids = [557]) {
    const requests: string[] = [];
    globalThis.fetch = mock((input: string | URL | Request) => {
        const url = String(input);
        requests.push(url);
        return Promise.resolve(
            Response.json(
                url.includes("/find/")
                    ? {
                          movie_results: ids.map((id) => ({ id })),
                      }
                    : {
                          genres: [{ name: "Action" }],
                          imdb_id: imdbId,
                          overview: "Provider description",
                          poster_path: "/provider-poster.jpg",
                          runtime: 121,
                          vote_average: 7.3,
                      }
            )
        );
    }) as unknown as typeof fetch;
    return requests;
}

test("uses the exact IMDb seed for TMDB lookup and preserves provider fields", async () => {
    const requests = mockMovieLookup("tt0145487");
    const metadata = await fetchSeededMovieMetadata(
        "https://www.imdb.com/title/tt0145487/",
        "test-token"
    );
    expect(requests).toEqual([
        "https://api.themoviedb.org/3/find/tt0145487?external_source=imdb_id",
        "https://api.themoviedb.org/3/movie/557",
    ]);
    expect(metadata).toEqual({
        description: "Provider description",
        genres: ["Action"],
        imdbUrl: "https://www.imdb.com/title/tt0145487/",
        posterUrl: "https://image.tmdb.org/t/p/w780/provider-poster.jpg",
        rating: 7.3,
        runtime: "2h 1m",
    });
});

test("rejects mismatched or ambiguous provider identities instead of searching by title", async () => {
    mockMovieLookup("tt9999999");
    await expect(
        fetchSeededMovieMetadata("https://www.imdb.com/title/tt0145487/", "test-token")
    ).rejects.toThrow("different IMDb identity");
    mockMovieLookup("tt0145487", [557, 558]);
    await expect(
        fetchSeededMovieMetadata("https://www.imdb.com/title/tt0145487/", "test-token")
    ).rejects.toThrow("one unique movie");
});
