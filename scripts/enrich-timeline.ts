/// <reference types="bun" />

import { resolve } from "node:path";
import { getTitleDetailsByIMDBId, getTitleDetailsByName, type ITitle } from "@valhalladev/movier";
import { isMetadataCacheRecordStale } from "../app/data/metadata-freshness";
import { log } from "../app/lib/console";

interface CacheRecord {
    error?: string;
    fetchedAt: string;
    requestedTitle: string;
    source: CachedTitle | null;
    status: "resolved" | "failed";
}

interface CachedTitle {
    description: string;
    genres: string[];
    imdbUrl?: string;
    posterUrl?: string;
    rating?: number;
    runtime: string;
    traktUrl: string;
}

interface TraktSearchResult {
    movie?: {
        ids: { slug?: string };
    };
    show?: {
        ids: { slug?: string };
    };
    type: "movie" | "show";
}

type MetadataCache = Record<string, CacheRecord>;

const cachePath = resolve(import.meta.dir, "../app/data/title-metadata.json");
// biome-ignore lint/correctness/noUndeclaredVariables: This script runs in the Bun runtime.
const refresh = Bun.argv.includes("--refresh");
const delayMs = 750;
const seasonSuffix = /\s+Season\s+\d+$/i;
const imdbIdPattern = /\/title\/(tt\d+)/;
const traktApiUrl = "https://api.trakt.tv";

const sleep = (milliseconds: number) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const readCache = async (): Promise<MetadataCache> => {
    // biome-ignore lint/correctness/noUndeclaredVariables: This script runs in the Bun runtime.
    const cacheFile = Bun.file(cachePath);
    return (await cacheFile.exists()) ? ((await cacheFile.json()) as MetadataCache) : {};
};

const writeCache = async (nextCache: MetadataCache) => {
    // biome-ignore lint/correctness/noUndeclaredVariables: This script runs in the Bun runtime.
    await Bun.write(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`);
};

const selectTitleData = (title: ITitle, traktUrl: string): CachedTitle => ({
    description: title.plot,
    genres: title.genres,
    imdbUrl: title.mainSource.sourceUrl,
    posterUrl: title.posterImage.url,
    rating: title.mainRate.rate,
    runtime: title.runtime.title,
    traktUrl,
});

const lookupTraktUrl = async (imdbUrl: string): Promise<string> => {
    const imdbId = imdbUrl.match(imdbIdPattern)?.[1];
    if (!imdbId) {
        throw new Error(`Cannot look up Trakt URL without a valid IMDb URL: ${imdbUrl}`);
    }

    const response = await fetch(`${traktApiUrl}/search/imdb/${imdbId}`, {
        headers: {
            "Content-Type": "application/json",
            "trakt-api-key": traktClientId,
            "trakt-api-version": "2",
        },
    });
    if (!response.ok) {
        throw new Error(`Trakt lookup failed for ${imdbId} with status ${response.status}`);
    }

    const results = (await response.json()) as TraktSearchResult[];
    const result = results.find((item) => item.type === "movie" || item.type === "show");
    const slug = result?.type === "movie" ? result.movie?.ids.slug : result?.show?.ids.slug;
    if (!(result && slug)) {
        throw new Error(`Trakt returned no movie or show for ${imdbId}`);
    }

    return `https://app.trakt.tv/${result.type === "movie" ? "movies" : "shows"}/${slug}`;
};

const lookupTitle = async (
    title: string,
    releaseDate: string,
    imdbUrl?: string
): Promise<ITitle> => {
    const imdbId = imdbUrl?.match(imdbIdPattern)?.[1];
    if (imdbId) {
        // Existing IMDb IDs are curated identifiers and avoid ambiguous title matches.
        return getTitleDetailsByIMDBId(imdbId, { tmdbReadAccessToken: token });
    }

    const baseTitle = title.replace(seasonSuffix, "");
    const queries = [...new Set([title, baseTitle])];
    let lastError: unknown;

    for (const query of queries) {
        try {
            // Sequential retries keep the fallback lookup from spamming the API.
            // biome-ignore lint/performance/noAwaitInLoops: Requests must remain sequential and rate-limited.
            return await getTitleDetailsByName(`${query} ${releaseDate.slice(0, 4)}`, {
                tmdbReadAccessToken: token,
            });
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError ?? new Error(`No result found for ${title}`);
};

const requireEnvironmentVariable = (name: "TMDB_READ_ACCESS_TOKEN" | "TRAKT_CLIENT_ID") => {
    const value = process.env[name]?.trim();
    if (!value) {
        log.error(`${name} is required. Add it to .env before running the enrichment script.`);
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

const token = requireEnvironmentVariable("TMDB_READ_ACCESS_TOKEN");
const traktClientId = requireEnvironmentVariable("TRAKT_CLIENT_ID");

// The cache may be incomplete after an interrupted enrichment run, so load the curated
// entries without constructing the application-facing chronology first.
process.env.TIMELINE_ALLOW_INCOMPLETE_METADATA = "1";
const { curatedChronology } = await import("../app/data/chronology");
delete process.env.TIMELINE_ALLOW_INCOMPLETE_METADATA;

const cache = await readCache();
let resolved = 0;
let skipped = 0;
let failed = 0;

for (const entry of curatedChronology) {
    const cachedEntry = cache[entry.slug];
    if (!(refresh || isMetadataCacheRecordStale(cachedEntry))) {
        skipped += 1;
        log.info(`Skipping ${entry.title}, cached metadata is current.`);
        continue;
    }

    if (!refresh && cachedEntry) {
        log.info(`Refreshing ${entry.title}, cached metadata is stale or unresolved.`);
    }

    try {
        // Each item is written immediately and delayed to keep the enrichment run API-friendly.
        // biome-ignore lint/performance/noAwaitInLoops: The script intentionally processes one title at a time.
        const title = await lookupTitle(entry.title, entry.releaseDate, entry.imdbUrl);
        // biome-ignore lint/performance/noAwaitInLoops: Trakt lookups share the sequential rate limit.
        const traktUrl = await lookupTraktUrl(title.mainSource.sourceUrl);

        cache[entry.slug] = {
            fetchedAt: new Date().toISOString(),
            requestedTitle: entry.title,
            source: selectTitleData(title, traktUrl),
            status: "resolved",
        };
        resolved += 1;
        log.ok(`Resolved ${entry.title}`);
    } catch (error) {
        // Keep the last known-good record if a provider is temporarily unavailable.
        if (!cachedEntry?.source) {
            cache[entry.slug] = {
                error: error instanceof Error ? error.message : String(error),
                fetchedAt: new Date().toISOString(),
                requestedTitle: entry.title,
                source: null,
                status: "failed",
            };
        }
        failed += 1;
        log.warn(`Failed to resolve ${entry.title}`, error);
    }

    await writeCache(cache);
    await sleep(delayMs);
}

log.info(`Finished. Resolved: ${resolved}, skipped: ${skipped}, failed: ${failed}.`);
log.info(`Cached metadata: ${cachePath}`);

log.info("Checking enriched data with the project lint command.");
// biome-ignore lint/correctness/noUndeclaredVariables: This script runs in the Bun runtime.
const lintProcess = Bun.spawn(["bun", "run", "lint:fix"], {
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
});
const lintExitCode = await lintProcess.exited;
if (lintExitCode !== 0) {
    process.exit(lintExitCode);
}
