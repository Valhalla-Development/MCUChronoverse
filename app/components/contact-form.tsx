"use client";

import Image from "next/image";
import {
    type ChangeEvent,
    type FormEvent,
    type MouseEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import type { ContentType } from "../data/types";
import { resetContactTurnstile, TurnstileWidget } from "./turnstile-widget";
import { UiIcon } from "./ui-icon";

const entryCategories = new Set(["Timeline placement", "Year or date", "Title information"]);

interface ContactEntry {
    contentType: ContentType;
    placement: string;
    posterUrl?: string;
    slug: string;
    title: string;
}

interface ContactFormProps {
    entries: readonly ContactEntry[];
    turnstileSiteKey: string;
}

interface ContactResponse {
    error?: string;
    issueNumber?: number;
    issueUrl?: string;
}

interface ContactPayload {
    category: string;
    context: string;
    correction: string;
    entrySlug: string;
    problem: string;
    source: string;
    turnstileToken: string;
}

interface SubmittedIssue {
    issueNumber: number;
    issueUrl: string;
}

const entryTypeLabels: Record<ContentType, string> = {
    film: "Film",
    "one-shot": "One-shot",
    series: "Series",
    short: "Short",
    special: "Special",
};

function entryTriggerLabel(
    category: string,
    entryRequired: boolean,
    selectedTitle: string | undefined
): string {
    if (!entryRequired) {
        return category ? "Not applicable for this category" : "Select a timeline entry";
    }

    return selectedTitle ?? "Select a timeline entry";
}

function contactPayload(form: FormData, entrySlug: string): ContactPayload {
    return {
        category: formValue(form, "category"),
        context: formValue(form, "context").trim(),
        correction: formValue(form, "correction").trim(),
        entrySlug,
        problem: formValue(form, "problem").trim(),
        source: formValue(form, "source").trim(),
        turnstileToken: formValue(form, "cf-turnstile-response"),
    };
}

function formValue(form: FormData, name: string): string {
    return String(form.get(name) ?? "");
}

async function submitContactSuggestion(payload: ContactPayload): Promise<SubmittedIssue> {
    const apiResponse = await fetch("/api/contact", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });
    const result = (await apiResponse.json()) as ContactResponse;
    if (!(apiResponse.ok && result.issueUrl && result.issueNumber)) {
        throw new Error(result.error ?? "The suggestion could not be submitted.");
    }

    return {
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
    };
}

function submissionErrorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "The suggestion could not be submitted right now.";
}

export function ContactForm({ entries, turnstileSiteKey }: ContactFormProps) {
    const entryPickerRef = useRef<HTMLDivElement>(null);
    const [category, setCategory] = useState("");
    const [entryOpen, setEntryOpen] = useState(false);
    const [entryError, setEntryError] = useState(false);
    const [selectedSlug, setSelectedSlug] = useState("");
    const [issueNumber, setIssueNumber] = useState<number | null>(null);
    const [issueUrl, setIssueUrl] = useState<string | null>(null);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const entryRequired = entryCategories.has(category);
    const selectedEntry = entries.find((entry) => entry.slug === selectedSlug);

    useEffect(() => {
        const closeEntryPicker = (event: PointerEvent) => {
            if (!entryPickerRef.current?.contains(event.target as Node)) {
                setEntryOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setEntryOpen(false);
            }
        };
        document.addEventListener("pointerdown", closeEntryPicker);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeEntryPicker);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    const handleCategoryChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
        const nextCategory = event.currentTarget.value;
        setCategory(nextCategory);
        setEntryOpen(false);
        setEntryError(false);
    }, []);

    const handleEntryToggle = useCallback(() => {
        setEntryOpen((current) => !current);
    }, []);

    const handleEntrySelect = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        setSelectedSlug(event.currentTarget.dataset.slug ?? "");
        setEntryOpen(false);
        setEntryError(false);
    }, []);

    const handleSubmit = useCallback(
        async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (entryRequired && !selectedEntry) {
                setEntryError(true);
                setEntryOpen(true);
                return;
            }
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            const payload = contactPayload(form, selectedEntry?.slug ?? "");
            if (!payload.turnstileToken) {
                setSubmissionError("Complete the verification before submitting.");
                return;
            }

            setIssueNumber(null);
            setIssueUrl(null);
            setSubmissionError(null);
            setSubmitting(true);

            try {
                const result = await submitContactSuggestion(payload);

                setIssueNumber(result.issueNumber);
                setIssueUrl(result.issueUrl);
                formElement.reset();
                setCategory("");
                setSelectedSlug("");
            } catch (error) {
                setSubmissionError(submissionErrorMessage(error));
            } finally {
                resetContactTurnstile();
                setSubmitting(false);
            }
        },
        [entryRequired, selectedEntry]
    );

    return (
        <form className="grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-4">
                <label className="grid gap-2">
                    <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                        What needs attention?
                    </span>
                    <select
                        className="focus-ring border border-white/10 bg-[#090a0d] px-4 py-3 text-sm text-white"
                        name="category"
                        onChange={handleCategoryChange}
                        required
                        value={category}
                    >
                        <option value="">Choose an area</option>
                        <option>Timeline placement</option>
                        <option>Year or date</option>
                        <option>Title information</option>
                        <option>Missing entry</option>
                        <option>Website improvement</option>
                        <option>Other</option>
                    </select>
                </label>

                <div
                    className={`relative grid gap-2 transition-opacity ${entryRequired ? "opacity-100" : "opacity-35"}`}
                    ref={entryPickerRef}
                >
                    <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                        Timeline entry
                    </span>
                    <button
                        aria-expanded={entryOpen}
                        aria-haspopup="listbox"
                        aria-invalid={entryError}
                        className="focus-ring flex min-h-16 items-center gap-3 border border-white/10 bg-black/25 px-3 py-2 text-left disabled:cursor-not-allowed"
                        disabled={!entryRequired}
                        onClick={handleEntryToggle}
                        type="button"
                    >
                        {entryRequired && selectedEntry ? (
                            <span className="relative h-11 w-8 shrink-0 overflow-hidden border border-white/10 bg-white/4">
                                {selectedEntry.posterUrl ? (
                                    <Image
                                        alt=""
                                        aria-hidden="true"
                                        className="object-cover"
                                        fill
                                        sizes="32px"
                                        src={selectedEntry.posterUrl}
                                    />
                                ) : null}
                            </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-sm text-white/70">
                            {entryTriggerLabel(category, entryRequired, selectedEntry?.title)}
                        </span>
                        <span
                            aria-hidden="true"
                            className={`text-white/28 transition-transform ${entryOpen ? "rotate-180" : ""}`}
                        >
                            <UiIcon className="h-4 w-4" name="chevron-down" />
                        </span>
                    </button>
                    {entryError ? (
                        <p className="font-mono text-[#ff8a6a] text-[0.7rem] uppercase tracking-widest">
                            Select the timeline entry this report is about.
                        </p>
                    ) : null}
                    {entryOpen && entryRequired ? (
                        <div
                            aria-label="Timeline entries"
                            className="contact-entry-menu"
                            role="listbox"
                        >
                            {entries.map((entry) => (
                                <button
                                    aria-selected={entry.slug === selectedSlug}
                                    className="focus-ring contact-entry-option"
                                    data-slug={entry.slug}
                                    key={entry.slug}
                                    onClick={handleEntrySelect}
                                    role="option"
                                    type="button"
                                >
                                    <span className="contact-entry-option-poster">
                                        {entry.posterUrl ? (
                                            <Image
                                                alt=""
                                                aria-hidden="true"
                                                className="object-cover"
                                                fill
                                                sizes="48px"
                                                src={entry.posterUrl}
                                            />
                                        ) : null}
                                    </span>
                                    <span className="contact-entry-option-copy">
                                        <span className="contact-entry-option-meta">
                                            <span>{entryTypeLabels[entry.contentType]}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>{entry.placement}</span>
                                        </span>
                                        <span className="contact-entry-option-title">
                                            {entry.title}
                                        </span>
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="contact-entry-option-status"
                                    >
                                        <UiIcon name="check" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            <label className="grid gap-2">
                <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                    What is currently wrong?
                </span>
                <textarea
                    className="focus-ring min-h-36 resize-y border border-white/10 bg-black/25 px-4 py-3 text-sm text-white leading-6 placeholder:text-white/22"
                    maxLength={2000}
                    name="problem"
                    placeholder="Tell us what the archive currently shows and why it appears incorrect."
                    required
                />
            </label>

            <label className="grid gap-2">
                <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                    What should it be?
                </span>
                <textarea
                    className="focus-ring min-h-36 resize-y border border-white/10 bg-black/25 px-4 py-3 text-sm text-white leading-6 placeholder:text-white/22"
                    maxLength={2000}
                    name="correction"
                    placeholder="Give the corrected information or explain your suggested improvement."
                    required
                />
            </label>

            <label className="grid gap-2">
                <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                    Supporting source <span className="text-white/20">Optional</span>
                </span>
                <input
                    className="focus-ring border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder:text-white/22"
                    maxLength={500}
                    name="source"
                    placeholder="Link to an official source or reference"
                    type="url"
                />
            </label>

            <label className="grid gap-2">
                <span className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                    Additional context <span className="text-white/20">Optional</span>
                </span>
                <textarea
                    className="focus-ring min-h-24 resize-y border border-white/10 bg-black/25 px-4 py-3 text-sm text-white leading-6 placeholder:text-white/22"
                    maxLength={1000}
                    name="context"
                    placeholder="Anything else that would help us review the suggestion."
                />
            </label>

            <div className="contact-verification">
                <div>
                    <p className="font-mono text-[0.7rem] text-white/45 uppercase tracking-[0.16em]">
                        Spam protection
                    </p>
                    <p className="mt-1 text-white/30 text-xs leading-5">
                        A quick privacy-friendly check keeps automated reports out of the archive.
                    </p>
                </div>
                <TurnstileWidget siteKey={turnstileSiteKey} />
            </div>

            <div className="flex flex-col gap-4 border-white/10 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-white/32 text-xs leading-5">
                    Your suggestion becomes a public GitHub issue for review. No GitHub account is
                    needed.
                </p>
                <button
                    className="focus-ring inline-flex items-center justify-center gap-3 border border-[#ff9b4a]/45 bg-[#ff8a3d]/10 px-5 py-3 font-mono text-[#ffad55] text-xs uppercase tracking-[0.14em] transition-colors hover:border-[#ff9b4a]/80 hover:bg-[#ff8a3d]/16 disabled:cursor-wait disabled:opacity-50"
                    disabled={submitting}
                    type="submit"
                >
                    {submitting ? "Sending suggestion" : "Submit suggestion"}
                    <span aria-hidden="true">
                        {submitting ? "…" : <UiIcon className="h-4 w-4" name="external-link" />}
                    </span>
                </button>
            </div>

            <div aria-live="polite">
                {submissionError ? (
                    <p className="contact-submission-message contact-submission-message-error">
                        {submissionError}
                    </p>
                ) : null}
                {issueUrl && issueNumber ? (
                    <p className="contact-submission-message contact-submission-message-success">
                        Suggestion #{issueNumber} is now awaiting review.
                        <a href={issueUrl} rel="noreferrer" target="_blank">
                            View public issue
                            <UiIcon className="inline-block h-3.5 w-3.5" name="external-link" />
                        </a>
                    </p>
                ) : null}
            </div>
        </form>
    );
}
