import { createHmac, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { log } from "../../lib/console";
import { checkDurableContactRateLimit } from "../../lib/contact-rate-limit";
import { buildContactIssue, parseContactSubmission } from "../../lib/contact-submission";
import { readLimitedJsonBody } from "../../lib/request-body";
import { siteOrigin } from "../../lib/site-origin";

export const runtime = "nodejs";

const alphaNumericCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const githubOwnerCharacters = `${alphaNumericCharacters}.-`;
const githubRepositoryCharacters = `${githubOwnerCharacters}_`;
const developmentTurnstileSecret = "1x0000000000000000000000000000000AA";
const requestWindowMs = 10 * 60 * 1000;
const requestLimit = 10;
const submissionWindowMs = 60 * 60 * 1000;
const submissionLimit = 3;
const maximumRequestBytes = 16_384;

interface TurnstileResult {
    action?: string;
    hostname?: string;
    success: boolean;
}

interface GitHubIssueResult {
    html_url?: string;
    number?: number;
}

function isGitHubRepository(value: string): boolean {
    const [owner, repository, extra] = value.split("/");
    return (
        extra === undefined &&
        owner !== undefined &&
        repository !== undefined &&
        owner.length >= 1 &&
        owner.length <= 39 &&
        repository.length >= 1 &&
        alphaNumericCharacters.includes(owner.charAt(0)) &&
        [...owner].every((character) => githubOwnerCharacters.includes(character)) &&
        [...repository].every((character) => githubRepositoryCharacters.includes(character))
    );
}

function response(body: object, status: number, headers?: HeadersInit) {
    return NextResponse.json(body, {
        headers: { "Cache-Control": "no-store", ...headers },
        status,
    });
}

async function readContactPayload(request: NextRequest) {
    const result = await readLimitedJsonBody(request, maximumRequestBytes);
    if (result.ok) {
        return result;
    }
    return {
        ok: false as const,
        response:
            result.reason === "too-large"
                ? response({ error: "That suggestion is too large to submit." }, 413)
                : response({ error: "The suggestion could not be read." }, 400),
    };
}

function clientAddress(request: NextRequest): string {
    if (process.env.NODE_ENV !== "production") {
        return "development";
    }

    const headerName = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
    if (
        !(headerName && ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"].includes(headerName))
    ) {
        throw new Error("TRUSTED_CLIENT_IP_HEADER must name a supported proxy header");
    }

    const headerValue = request.headers.get(headerName);
    const address =
        headerName === "x-forwarded-for" ? headerValue?.split(",")[0]?.trim() : headerValue?.trim();
    if (!address) {
        throw new Error(`The trusted proxy did not set ${headerName}`);
    }
    return address;
}

function rateLimitKey(address: string): string {
    if (process.env.NODE_ENV !== "production") {
        return "development";
    }

    const secret = process.env.CONTACT_RATE_LIMIT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("CONTACT_RATE_LIMIT_SECRET must contain at least 32 characters");
    }
    return createHmac("sha256", secret).update(address).digest("hex");
}

function hasTrustedOrigin(request: NextRequest): boolean {
    if (process.env.NODE_ENV !== "production") {
        return true;
    }

    const origin = request.headers.get("origin");
    if (!origin) {
        return false;
    }

    try {
        return new URL(origin).origin === siteOrigin({ requireConfigured: true });
    } catch {
        return false;
    }
}

async function verifyTurnstile(token: string, address: string): Promise<boolean> {
    const secret =
        process.env.NODE_ENV === "production"
            ? process.env.TURNSTILE_SECRET_KEY
            : developmentTurnstileSecret;
    if (!secret) {
        throw new Error("TURNSTILE_SECRET_KEY is required in production");
    }

    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        body: JSON.stringify({
            idempotency_key: randomUUID(),
            remoteip: address,
            response: token,
            secret,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(8000),
    });
    if (!verification.ok) {
        throw new Error(`Turnstile returned HTTP ${verification.status}`);
    }

    const result = (await verification.json()) as TurnstileResult;
    if (!result.success) {
        return false;
    }

    if (process.env.NODE_ENV === "production") {
        if (result.action !== "contact_submission") {
            return false;
        }
        const expectedHostname = new URL(siteOrigin({ requireConfigured: true })).hostname;
        return result.hostname === expectedHostname;
    }

    return true;
}

async function createGitHubIssue(title: string, body: string): Promise<GitHubIssueResult> {
    const token = process.env.GITHUB_ISSUES_TOKEN;
    if (!token) {
        throw new Error("GITHUB_ISSUES_TOKEN is required");
    }
    const repository = process.env.GITHUB_ISSUES_REPOSITORY;
    if (!(repository && isGitHubRepository(repository))) {
        throw new Error("GITHUB_ISSUES_REPOSITORY must be a valid owner/repository value");
    }

    const githubResponse = await fetch(`https://api.github.com/repos/${repository}/issues`, {
        body: JSON.stringify({ body, labels: ["timeline", "correction"], title }),
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "MCU-Chronoverse",
            "X-GitHub-Api-Version": "2026-03-10",
        },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
    });

    if (!githubResponse.ok) {
        throw new Error(`GitHub returned HTTP ${githubResponse.status}`);
    }

    return (await githubResponse.json()) as GitHubIssueResult;
}

function requestValidationResponse(request: NextRequest) {
    if (!hasTrustedOrigin(request)) {
        return response({ error: "This submission origin is not allowed." }, 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return response({ error: "The suggestion must be sent as JSON." }, 415);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > maximumRequestBytes) {
        return response({ error: "That suggestion is too large to submit." }, 413);
    }
    return null;
}

function clientContext(request: NextRequest) {
    const address = clientAddress(request);
    return { address, addressKey: rateLimitKey(address) };
}

async function requestRateLimitResponse(addressKey: string) {
    if (process.env.NODE_ENV !== "production") {
        return null;
    }
    const rateLimit = await checkDurableContactRateLimit(`request:${addressKey}`, {
        limit: requestLimit,
        windowMs: requestWindowMs,
    }).catch((error: unknown) => {
        log.error("Contact rate limiting is unavailable", error);
        return null;
    });
    if (!rateLimit) {
        return response({ error: "The suggestion service is unavailable right now." }, 503);
    }
    return rateLimit.allowed
        ? null
        : response(
              {
                  error: "Too many suggestions were sent from this connection. Try again shortly.",
              },
              429,
              { "Retry-After": String(rateLimit.retryAfterSeconds) }
          );
}

async function submissionRateLimitResponse(addressKey: string) {
    if (process.env.NODE_ENV !== "production") {
        return null;
    }
    const rateLimit = await checkDurableContactRateLimit(`submission:${addressKey}`, {
        limit: submissionLimit,
        windowMs: submissionWindowMs,
    });
    return rateLimit.allowed
        ? null
        : response(
              {
                  error: "This connection has reached the hourly suggestion limit. Try again later.",
              },
              429,
              { "Retry-After": String(rateLimit.retryAfterSeconds) }
          );
}

async function submitContactRequest(request: NextRequest, address: string, addressKey: string) {
    const bodyResult = await readContactPayload(request);
    if (!bodyResult.ok) {
        return bodyResult.response;
    }
    const parsed = parseContactSubmission(bodyResult.value);
    if (!parsed.submission) {
        return response({ error: parsed.error ?? "Check the suggestion and try again." }, 400);
    }
    const verified = await verifyTurnstile(parsed.submission.turnstileToken, address);
    if (!verified) {
        return response({ error: "Verification expired or failed. Please try again." }, 400);
    }
    const rateLimitResponse = await submissionRateLimitResponse(addressKey);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }
    const issue = buildContactIssue(parsed.submission);
    const createdIssue = await createGitHubIssue(issue.title, issue.body);
    if (!(createdIssue.html_url && createdIssue.number)) {
        throw new Error("GitHub returned an incomplete issue response");
    }
    log.ok(`Timeline suggestion #${createdIssue.number} was created`);
    return response({ issueNumber: createdIssue.number, issueUrl: createdIssue.html_url }, 201);
}

export async function POST(request: NextRequest) {
    const validationResponse = requestValidationResponse(request);
    if (validationResponse) {
        return validationResponse;
    }

    let context: ReturnType<typeof clientContext>;
    try {
        context = clientContext(request);
    } catch (error) {
        log.error("Contact protection is not configured", error);
        return response({ error: "The suggestion service is not configured right now." }, 503);
    }
    const rateLimitResponse = await requestRateLimitResponse(context.addressKey);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    try {
        return await submitContactRequest(request, context.address, context.addressKey);
    } catch (error) {
        log.error("Timeline suggestion could not be created", error);
        return response(
            { error: "The suggestion could not be submitted right now. Please try again later." },
            502
        );
    }
}
