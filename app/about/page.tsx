import type { Metadata } from "next";
import Link from "next/link";
import { UiIcon } from "../components/ui-icon";

export const metadata: Metadata = {
    alternates: {
        canonical: "/about",
    },
    description:
        "Learn how MCU Chronoverse organises films, series, specials, shorts, and one-shots into one explorable story timeline.",
    openGraph: {
        description:
            "Learn how MCU Chronoverse organises films, series, specials, shorts, and one-shots into one explorable story timeline.",
        images: ["/og.png"],
        siteName: "MCU Chronoverse",
        title: "About the archive",
        type: "website",
        url: "/about",
    },
    title: "About the archive",
    twitter: {
        card: "summary_large_image",
        description:
            "Learn how MCU Chronoverse organises films, series, specials, shorts, and one-shots into one explorable story timeline.",
        images: ["/og.png"],
        title: "About the archive",
    },
};

const currentYear = new Date().getFullYear();

export default function AboutPage() {
    return (
        <main className="relative min-h-screen overflow-hidden">
            <div className="star-field" />
            <div className="grain" />
            <header className="border-white/10 border-b bg-void/82 backdrop-blur-xl">
                <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
                    <Link className="focus-ring inline-flex items-center gap-3" href="/">
                        <span className="grid size-9 place-items-center border border-signal/70 bg-signal/10 font-mono font-semibold text-signal text-xs">
                            616
                        </span>
                        <span className="font-semibold text-sm uppercase tracking-[0.23em]">
                            MCU <span className="text-white/45">Chronoverse</span>
                        </span>
                    </Link>
                    <Link
                        className="focus-ring font-mono text-muted text-xs uppercase tracking-[0.18em] transition-colors hover:text-ink"
                        href="/"
                    >
                        Return to timeline
                    </Link>
                </div>
            </header>

            <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
                <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <div>
                        <p className="flex items-center gap-3 font-mono text-gold text-xs uppercase tracking-[0.25em]">
                            <span className="h-px w-8 bg-gold/70" />
                            About the archive
                        </p>
                        <h1 className="mt-6 max-w-4xl text-balance font-semibold text-5xl leading-[0.96] tracking-[-0.055em] sm:text-7xl">
                            A clearer path through
                            <span className="block text-white/35">an expanding universe.</span>
                        </h1>
                        <p className="mt-7 max-w-2xl text-lg text-white/56 leading-8">
                            MCU Chronoverse is a fan-made guide built to make Marvel's sprawling
                            screen universe easier to explore, filter, and understand.
                        </p>
                    </div>

                    <aside className="relative overflow-hidden border border-gold/25 bg-[#0d0d0f]/90 p-6 sm:p-7">
                        <span className="absolute top-0 left-0 h-px w-20 bg-gold" />
                        <p className="font-mono text-[0.72rem] text-gold uppercase tracking-[0.18em]">
                            First transmission
                        </p>
                        <h2 className="mt-5 font-semibold text-2xl tracking-[-0.035em]">
                            New to the MCU?
                        </h2>
                        <p className="mt-3 text-sm text-white/52 leading-6">
                            Start in release-date order. A chronological watch can reveal future
                            events early, especially through post-credit scenes.
                        </p>
                        <Link
                            className="focus-ring mt-6 inline-flex items-center gap-3 font-mono text-signal text-xs uppercase tracking-[0.14em] transition-colors hover:text-ink"
                            href="/?order=release"
                        >
                            View release order
                            <UiIcon className="h-4 w-4" name="external-link" />
                        </Link>
                    </aside>
                </div>

                <div className="mt-20 grid gap-10 border-white/10 border-t pt-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
                    <div>
                        <p className="font-mono text-signal text-xs uppercase tracking-[0.2em]">
                            Reading the map
                        </p>
                        <h2 className="mt-4 text-balance font-semibold text-3xl tracking-[-0.04em]">
                            Chronology is an interpretation.
                        </h2>
                    </div>

                    <div className="max-w-2xl text-white/58 leading-7">
                        <p>
                            There is no single definitive source for the MCU timeline. After
                            <em> Avengers: Endgame</em>, establishing a precise chronology became
                            increasingly difficult as Marvel introduced more interconnected stories,
                            the multiverse, alternate universes, and events outside the main
                            timeline.
                        </p>
                        <p className="mt-5">
                            Compare several timeline sources and you will likely find small
                            differences. Stories may contain conflicting dates or leave gaps that
                            require interpretation. That does not necessarily make one source wrong,
                            nor does it diminish the viewing experience. Many stories never directly
                            reference one another, so a little variation is reasonable.
                        </p>

                        <details className="group mt-8 border border-white/10 bg-white/2.5">
                            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-6 p-5 font-mono text-gold text-xs uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">
                                <span>Spoiler: The Fantastic Four: First Steps</span>
                                <span
                                    aria-hidden="true"
                                    className="text-lg transition-transform group-open:rotate-45"
                                >
                                    +
                                </span>
                            </summary>
                            <p className="border-white/10 border-t px-5 py-5 text-sm text-white/50 leading-7">
                                <em>The Fantastic Four: First Steps</em> is set in a
                                retro-futuristic alternate universe inspired by the 1960s. Its
                                events can be positioned by era, but treating that placement as part
                                of the main Earth-616 timeline would be misleading.
                            </p>
                        </details>
                    </div>
                </div>

                <footer className="mt-20 grid gap-8 border-white/10 border-t pt-8 text-white/36 text-xs leading-6 sm:grid-cols-2">
                    <p>
                        MCU Chronoverse is an independent fan project and is not affiliated with or
                        endorsed by Marvel Entertainment or The Walt Disney Company. Titles and
                        related properties belong to their respective owners.
                    </p>
                    <p className="sm:text-right">
                        Open-source software licensed under the GNU GPL v3.
                        <br />
                        Copyright © {currentYear} Valhalla Development{" "}
                        <a
                            className="focus-ring text-white/65 underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink"
                            href="https://github.com/Valhalla-Development/MCUChronoverse"
                            rel="noreferrer"
                            target="_blank"
                        >
                            View on GitHub
                        </a>
                    </p>
                </footer>
            </section>
        </main>
    );
}
