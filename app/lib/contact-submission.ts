import { chronology } from "../data/chronology";

export const contactCategories = [
    "Timeline placement",
    "Year or date",
    "Title information",
    "Missing entry",
    "Website improvement",
    "Other",
] as const;

export const entryContactCategories = new Set<string>([
    "Timeline placement",
    "Year or date",
    "Title information",
]);

export interface ContactSubmission {
    category: (typeof contactCategories)[number];
    context: string;
    correction: string;
    entryTitle: string;
    problem: string;
    source: string;
    turnstileToken: string;
}

interface ParseResult {
    error?: string;
    submission?: ContactSubmission;
}

interface ContactFields {
    category: string | null;
    context: string | null;
    correction: string | null;
    entrySlug: string | null;
    problem: string | null;
    source: string | null;
    turnstileToken: string | null;
}

const chronologyBySlug = new Map(chronology.map((entry) => [entry.slug, entry]));

function readString(value: unknown): string | null {
    return typeof value === "string" ? value.trim() : null;
}

function isAllowedSource(value: string): boolean {
    if (!value) {
        return true;
    }

    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function escapeTableCell(value: string): string {
    return safeIssueText(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function safeIssueText(value: string): string {
    return value.replaceAll("@", "@\u200B").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function readContactFields(input: Record<string, unknown>): ContactFields {
    return {
        category: readString(input.category),
        context: readString(input.context),
        correction: readString(input.correction),
        entrySlug: readString(input.entrySlug),
        problem: readString(input.problem),
        source: readString(input.source),
        turnstileToken: readString(input.turnstileToken),
    };
}

function categoryError(category: string | null): string | undefined {
    return category && contactCategories.includes(category as ContactSubmission["category"])
        ? undefined
        : "Choose what needs attention.";
}

function boundedTextError(
    value: string | null,
    minimum: number,
    maximum: number,
    message: string
): string | undefined {
    return value && value.length >= minimum && value.length <= maximum ? undefined : message;
}

function contactFieldError(fields: ContactFields): string | undefined {
    const errors = [
        categoryError(fields.category),
        boundedTextError(
            fields.problem,
            10,
            2000,
            "Describe the current problem in between 10 and 2,000 characters."
        ),
        boundedTextError(
            fields.correction,
            10,
            2000,
            "Describe the suggested change in between 10 and 2,000 characters."
        ),
        fields.context !== null && fields.context.length <= 1000
            ? undefined
            : "Additional context must be no longer than 1,000 characters.",
        fields.source !== null && fields.source.length <= 500 && isAllowedSource(fields.source)
            ? undefined
            : "Supporting evidence must be a valid HTTP or HTTPS link.",
        fields.turnstileToken && fields.turnstileToken.length <= 2048
            ? undefined
            : "Complete the verification before submitting.",
    ];
    return errors.find((error) => error !== undefined);
}

function contactEntry(fields: ContactFields) {
    if (!(fields.category && fields.entrySlug && entryContactCategories.has(fields.category))) {
        return;
    }
    return chronologyBySlug.get(fields.entrySlug);
}

function normalizedField(value: string | null): string {
    return value ?? "";
}

function contactEntryTitle(entry: ReturnType<typeof contactEntry>): string {
    return entry?.title ?? "Not applicable";
}

function entryError(fields: ContactFields, entry: ReturnType<typeof contactEntry>) {
    return fields.category && entryContactCategories.has(fields.category) && !entry
        ? "Select the timeline entry this report is about."
        : undefined;
}

function validSubmission(
    fields: ContactFields,
    entry: ReturnType<typeof contactEntry>
): ContactSubmission {
    return {
        category: fields.category as ContactSubmission["category"],
        context: normalizedField(fields.context),
        correction: normalizedField(fields.correction),
        entryTitle: contactEntryTitle(entry),
        problem: normalizedField(fields.problem),
        source: normalizedField(fields.source),
        turnstileToken: normalizedField(fields.turnstileToken),
    };
}

export function parseContactSubmission(value: unknown): ParseResult {
    if (!value || typeof value !== "object") {
        return { error: "The suggestion could not be read." };
    }

    const fields = readContactFields(value as Record<string, unknown>);
    const error = contactFieldError(fields);
    if (error) {
        return { error };
    }

    const entry = contactEntry(fields);
    const missingEntryError = entryError(fields, entry);
    if (missingEntryError) {
        return { error: missingEntryError };
    }

    return { submission: validSubmission(fields, entry) };
}

export function buildContactIssue(submission: ContactSubmission): {
    body: string;
    title: string;
} {
    const details = [
        "| Field | Value |",
        "| --- | --- |",
        `| **Entry** | ${escapeTableCell(submission.entryTitle)} |`,
        `| **Area** | ${escapeTableCell(submission.category)} |`,
    ].join("\n");
    const body = [
        "## Report details",
        details,
        `## Current archive entry\n\n${safeIssueText(submission.problem)}`,
        `## Suggested correction\n\n${safeIssueText(submission.correction)}`,
        `## Supporting source\n\n${safeIssueText(submission.source || "Not provided")}`,
        ...(submission.context
            ? [`## Additional context\n\n${safeIssueText(submission.context)}`]
            : []),
        "---\n_Submitted through [MCU Chronoverse](https://mcu.valhalladev.org)._",
    ].join("\n\n");

    return {
        body,
        title: `[Timeline correction] ${submission.entryTitle === "Not applicable" ? submission.category : submission.entryTitle}`,
    };
}
