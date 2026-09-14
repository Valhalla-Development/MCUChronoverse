import { isMetadataCacheRecordStale, type MetadataCacheRecord } from "./app/data/metadata-freshness";
import titleMetadata from "./app/data/title-metadata.json";
import { log } from "./app/lib/console";
import { isSupabaseConfigured } from "./app/lib/supabase/config";
import packageMetadata from "./package.json";

const globalForBoot = globalThis as typeof globalThis & { __portalBooted?: boolean };

const metadataRecords = titleMetadata as Record<string, MetadataCacheRecord>;

function runtimeLabel(): string {
    if (process.versions.bun) {
        return `Bun ${process.versions.bun} · ${process.platform} ${process.arch}`;
    }
    return `${process.version} · ${process.platform} ${process.arch}`;
}

function originUrl(): string {
    const port = process.env.PORT ?? "3000";
    return `http://localhost:${port}`;
}

export function registerNode(): void {
    if (globalForBoot.__portalBooted) {
        return;
    }
    globalForBoot.__portalBooted = true;

    const origin = originUrl();
    const heapMb = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);

    log.ready({
        boot: `${process.uptime().toFixed(2)}s`,
        heap: `${heapMb.toLocaleString("en")} MB`,
        name: "Chronoverse",
        origin,
        pid: String(process.pid),
        runtime: runtimeLabel(),
        version: `v${packageMetadata.version}`,
    });
    const staleMetadataCount = Object.values(metadataRecords).filter((record) =>
        isMetadataCacheRecordStale(record)
    ).length;
    if (staleMetadataCount > 0) {
        log.warn(
            `Timeline metadata is stale for ${staleMetadataCount} ${staleMetadataCount === 1 ? "entry" : "entries"}. Run bun run data:enrich to refresh it.`
        );
    }
    if (process.env.NODE_ENV === "development" && !isSupabaseConfigured) {
        log.warn("Supabase is not configured: authentication and synced watch progress are disabled.");
    }
}

export function logRequestError(
    error: { digest: string } & Error,
    request: {
        method: string;
        path: string;
    }
): void {
    log.error(`${request.method} ${request.path}`, error);
}
