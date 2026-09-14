"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { UiIcon } from "./ui-icon";

type AuthMode = "forgot-password" | "reset-complete" | "reset-password" | "sign-in" | "sign-up";
type PendingAction = "discord" | "email" | null;

const emailAuthFallbacks: Record<AuthMode, string> = {
    "forgot-password": "The reset email could not be sent. Please try again.",
    "reset-complete": "Those details could not be authenticated. Check them and try again.",
    "reset-password": "Your password could not be updated. Request a new reset link and try again.",
    "sign-in": "Those details could not be authenticated. Check them and try again.",
    "sign-up": "This account could not be created. Check the details and try again.",
};

const emailAuthErrorRules = [
    {
        matches: (message: string) =>
            message.includes("already registered") || message.includes("already exists"),
        response: "That email already has an account. Switch to sign in instead.",
    },
    {
        matches: (message: string) => message.includes("signup") && message.includes("disabled"),
        response: "New account registration is currently disabled.",
    },
    {
        matches: (message: string) => message.includes("password") && message.includes("weak"),
        response:
            "That password is too weak. Use at least 8 characters with a less predictable phrase.",
    },
    {
        matches: (message: string) => message.includes("invalid login credentials"),
        response: "That email or password is incorrect.",
    },
] as const;

function describeEmailAuthError(message: string, mode: AuthMode) {
    const normalized = message.toLowerCase();
    const knownError = emailAuthErrorRules.find((rule) => rule.matches(normalized));
    const fallback = knownError?.response ?? emailAuthFallbacks[mode];
    return process.env.NODE_ENV === "development" ? `${fallback} (${message})` : fallback;
}

function emailActionLabel(mode: AuthMode, pending: boolean) {
    const labels: Record<AuthMode, [string, string]> = {
        "forgot-password": ["Send reset email", "Sending reset email..."],
        "reset-complete": ["Continue", "Continue"],
        "reset-password": ["Update password", "Updating password..."],
        "sign-in": ["Sign in with email", "Signing in..."],
        "sign-up": ["Create account with email", "Creating account..."],
    };
    return labels[mode][pending ? 1 : 0];
}

function modalContent(mode: AuthMode) {
    if (mode === "forgot-password") {
        return {
            copy: "Enter your account email and Supabase will send you a secure password reset link.",
            kicker: "Account recovery",
            title: "Find your way back.",
        };
    }
    if (mode === "reset-password") {
        return {
            copy: "Choose a new password for your archive account. Your recovery session is verified by Supabase.",
            kicker: "Account recovery",
            title: "Set a new password.",
        };
    }
    if (mode === "reset-complete") {
        return {
            copy: "Your password has been updated and this browser is signed in to your archive account.",
            kicker: "Recovery complete",
            title: "You are back in.",
        };
    }
    return {
        copy: "Sign in with Discord or email to carry your account watch progress across devices. We only store your account connection and the titles you mark watched.",
        kicker: "Archive account",
        title: "Keep your place in the timeline.",
    };
}

function passwordsMatch(mode: AuthMode, password: string, confirmation: string) {
    return !(mode === "sign-up" || mode === "reset-password") || password === confirmation;
}

type EmailAuthOutcome =
    | { kind: "complete" }
    | { kind: "error"; message: string }
    | { kind: "message"; message: string }
    | { kind: "reset-complete" };

async function authenticateWithEmail(
    mode: AuthMode,
    email: string,
    password: string
): Promise<EmailAuthOutcome> {
    const supabase = createClient();
    if (mode === "forgot-password") {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", "/?auth=reset-password");
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: callbackUrl.toString(),
        });
        return error
            ? { kind: "error", message: describeEmailAuthError(error.message, mode) }
            : {
                  kind: "message",
                  message:
                      "If that email belongs to an account, a secure reset link is on its way.",
              };
    }
    if (mode === "reset-password") {
        const { error } = await supabase.auth.updateUser({ password });
        return error
            ? { kind: "error", message: describeEmailAuthError(error.message, mode) }
            : { kind: "reset-complete" };
    }
    const result =
        mode === "sign-in"
            ? await supabase.auth.signInWithPassword({ email, password })
            : await supabase.auth.signUp({
                  email,
                  options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
                  password,
              });
    if (result.error) {
        return { kind: "error", message: describeEmailAuthError(result.error.message, mode) };
    }
    return mode === "sign-up" && !result.data.session
        ? {
              kind: "message",
              message: "Check your email to confirm your account, then sign in here.",
          }
        : { kind: "complete" };
}

function keepFocusInDialog(event: KeyboardEvent, dialog: HTMLElement | null) {
    const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) {
        return;
    }
    const [first] = focusable;
    const last = focusable.item(focusable.length - 1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}

function handleDialogKeyDown(event: KeyboardEvent, dialog: HTMLElement | null, close: () => void) {
    if (event.key === "Escape") {
        close();
    } else if (event.key === "Tab") {
        keepFocusInDialog(event, dialog);
    }
}

interface EmailAuthFormProps {
    busy: boolean;
    email: string;
    mode: AuthMode;
    onEmailChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onPasswordChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onPasswordConfirmationChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    password: string;
    passwordConfirmation: string;
    submitLabel: string;
}

function EmailAuthForm({
    busy,
    email,
    mode,
    onEmailChange,
    onPasswordChange,
    onPasswordConfirmationChange,
    onSubmit,
    password,
    passwordConfirmation,
    submitLabel,
}: EmailAuthFormProps) {
    const showAccountEntry = mode === "sign-in" || mode === "sign-up";
    const showConfirmation = mode === "sign-up" || mode === "reset-password";
    const showEmail = mode !== "reset-password";
    const showPassword = mode !== "forgot-password";
    const passwordLabel = mode === "reset-password" ? "New password" : "Password";

    return (
        <form className="timeline-auth-form" onSubmit={onSubmit}>
            {showEmail ? (
                <label>
                    <span>Email</span>
                    <input
                        autoComplete="email"
                        data-auth-initial-focus={!showAccountEntry || undefined}
                        disabled={busy}
                        onChange={onEmailChange}
                        required
                        type="email"
                        value={email}
                    />
                </label>
            ) : null}
            {showPassword ? (
                <label>
                    <span>{passwordLabel}</span>
                    <input
                        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                        data-auth-initial-focus={mode === "reset-password" || undefined}
                        disabled={busy}
                        minLength={mode === "sign-in" ? 6 : 8}
                        onChange={onPasswordChange}
                        required
                        type="password"
                        value={password}
                    />
                </label>
            ) : null}
            {showConfirmation ? (
                <label>
                    <span>Confirm password</span>
                    <input
                        autoComplete="new-password"
                        disabled={busy}
                        minLength={8}
                        onChange={onPasswordConfirmationChange}
                        required
                        type="password"
                        value={passwordConfirmation}
                    />
                </label>
            ) : null}
            <button className="focus-ring timeline-auth-email-submit" disabled={busy} type="submit">
                {submitLabel}
            </button>
        </form>
    );
}

interface SecondaryActionsProps {
    busy: boolean;
    mode: AuthMode;
    onForgotPassword: () => void;
    onShowSignIn: () => void;
    onToggleRegistration: () => void;
}

function SecondaryActions({
    busy,
    mode,
    onForgotPassword,
    onShowSignIn,
    onToggleRegistration,
}: SecondaryActionsProps) {
    if (mode === "forgot-password") {
        return (
            <button
                className="focus-ring timeline-auth-switch"
                disabled={busy}
                onClick={onShowSignIn}
                type="button"
            >
                Back to sign in
            </button>
        );
    }
    if (!(mode === "sign-in" || mode === "sign-up")) {
        return null;
    }
    return (
        <div className="timeline-auth-secondary-actions">
            {mode === "sign-in" ? (
                <button
                    className="focus-ring timeline-auth-switch"
                    disabled={busy}
                    onClick={onForgotPassword}
                    type="button"
                >
                    Forgot password?
                </button>
            ) : null}
            <button
                className="focus-ring timeline-auth-switch"
                disabled={busy}
                onClick={onToggleRegistration}
                type="button"
            >
                {mode === "sign-in"
                    ? "Need an account? Register with email"
                    : "Already registered? Sign in"}
            </button>
        </div>
    );
}

export function AuthMenu() {
    const [open, setOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [oauthError, setOauthError] = useState<string | null>(null);
    const [callbackError, setCallbackError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [mode, setMode] = useState<AuthMode>("sign-in");
    const dialog = useRef<HTMLElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const busy = pendingAction !== null;

    const focusInitialControl = useCallback(() => {
        window.requestAnimationFrame(() =>
            dialog.current?.querySelector<HTMLElement>("[data-auth-initial-focus]")?.focus()
        );
    }, []);

    const close = useCallback(() => {
        setOpen(false);
        setEmailError(null);
        setOauthError(null);
        setMessage(null);
        window.requestAnimationFrame(() => returnFocus.current?.focus());
    }, []);

    useEffect(() => {
        const openAuth = () => {
            returnFocus.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setEmailError(null);
            setOauthError(null);
            setCallbackError(null);
            setMessage(null);
            setMode("sign-in");
            setPassword("");
            setPasswordConfirmation("");
            setOpen(true);
            focusInitialControl();
        };
        window.addEventListener("mcu-chronoverse:open-auth", openAuth);
        const currentUrl = new URL(window.location.href);
        const authResult = currentUrl.searchParams.get("auth");
        if (authResult === "failed" || authResult === "reset-password") {
            currentUrl.searchParams.delete("auth");
            window.history.replaceState(null, "", currentUrl);
            if (authResult === "failed") {
                setCallbackError("Your sign-in link could not be completed. Please try again.");
            } else {
                setMode("reset-password");
            }
            setOpen(true);
            focusInitialControl();
        }
        return () => window.removeEventListener("mcu-chronoverse:open-auth", openAuth);
    }, [focusInitialControl]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) =>
            handleDialogKeyDown(event, dialog.current, close);
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [close, open]);

    const handleOAuth = useCallback(() => {
        if (!isSupabaseConfigured) {
            setOauthError("Authentication is unavailable because Supabase is not configured.");
            return;
        }
        setPendingAction("discord");
        setOauthError(null);
        setMessage(null);
        window.location.assign("/auth/discord");
    }, []);

    const handleBackdropPointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) {
                close();
            }
        },
        [close]
    );

    const handleEmailAuth = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setEmailError(null);
            setMessage(null);
            if (!passwordsMatch(mode, password, passwordConfirmation)) {
                setEmailError("The passwords do not match.");
                return;
            }

            setPendingAction("email");
            try {
                const outcome = await authenticateWithEmail(mode, email, password);
                if (outcome.kind === "error") {
                    setEmailError(outcome.message);
                } else if (outcome.kind === "message") {
                    setMessage(outcome.message);
                    setPassword("");
                    setPasswordConfirmation("");
                } else if (outcome.kind === "complete") {
                    setPassword("");
                    setPasswordConfirmation("");
                    close();
                } else {
                    setPassword("");
                    setPasswordConfirmation("");
                    setMode("reset-complete");
                    focusInitialControl();
                }
            } catch {
                setEmailError("The authentication service could not be reached. Please try again.");
            } finally {
                setPendingAction(null);
            }
        },
        [close, email, focusInitialControl, mode, password, passwordConfirmation]
    );

    const changeMode = useCallback(
        (nextMode: AuthMode) => {
            setMode(nextMode);
            setPassword("");
            setPasswordConfirmation("");
            setEmailError(null);
            setMessage(null);
            focusInitialControl();
        },
        [focusInitialControl]
    );

    const toggleRegistration = useCallback(() => {
        changeMode(mode === "sign-in" ? "sign-up" : "sign-in");
    }, [changeMode, mode]);

    const showForgotPassword = useCallback(() => {
        changeMode("forgot-password");
    }, [changeMode]);

    const showSignIn = useCallback(() => {
        changeMode("sign-in");
    }, [changeMode]);

    const finishRecovery = useCallback(() => {
        setMode("sign-in");
        setPassword("");
        setPasswordConfirmation("");
        setEmailError(null);
        setMessage(null);
        close();
    }, [close]);

    const handleEmailChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(event.currentTarget.value);
    }, []);

    const handlePasswordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(event.currentTarget.value);
    }, []);

    const handlePasswordConfirmationChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setPasswordConfirmation(event.currentTarget.value);
        },
        []
    );

    if (!open) {
        return null;
    }

    const content = modalContent(mode);
    const emailSubmitLabel = emailActionLabel(mode, pendingAction === "email");
    const showAccountEntry = mode === "sign-in" || mode === "sign-up";

    return (
        <div
            className="timeline-auth-modal-backdrop"
            onPointerDown={handleBackdropPointerDown}
            role="presentation"
        >
            <section
                aria-describedby="timeline-auth-description"
                aria-labelledby="timeline-auth-title"
                aria-modal="true"
                className="timeline-auth-modal"
                ref={dialog}
                role="dialog"
            >
                <button
                    aria-label="Close account dialog"
                    className="focus-ring timeline-auth-close"
                    onClick={close}
                    type="button"
                >
                    <UiIcon name="close" />
                </button>
                <p className="timeline-auth-kicker">{content.kicker}</p>
                <h2 id="timeline-auth-title">{content.title}</h2>
                <p className="timeline-auth-copy" id="timeline-auth-description">
                    {content.copy}
                </p>
                {isSupabaseConfigured ? null : (
                    <p className="timeline-auth-error" role="alert">
                        Authentication is unavailable in this development environment.
                    </p>
                )}
                {callbackError ? (
                    <p className="timeline-auth-error" role="alert">
                        {callbackError}
                    </p>
                ) : null}
                {showAccountEntry ? (
                    <>
                        <button
                            className="focus-ring timeline-auth-discord"
                            data-auth-initial-focus
                            disabled={busy}
                            onClick={handleOAuth}
                            type="button"
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24">
                                <path d="M19.54 5.32A16.2 16.2 0 0 0 15.5 4l-.5 1.03a14.4 14.4 0 0 0-6 0L8.5 4c-1.43.25-2.78.7-4.04 1.32C1.9 9.24 1.2 13.07 1.55 16.85a16.3 16.3 0 0 0 4.96 2.5l1.2-1.63c-.66-.24-1.3-.55-1.9-.9l.47-.36c3.66 1.7 7.62 1.7 11.23 0l.48.36c-.6.35-1.24.66-1.9.9l1.2 1.63a16.3 16.3 0 0 0 4.96-2.5c.4-4.38-.7-8.18-2.71-11.53ZM8.47 14.64c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2 .99 2 2.2-.9 2.2-2 2.2Zm7.06 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2 .99 2 2.2-.9 2.2-2 2.2Z" />
                            </svg>
                            <span>
                                {pendingAction === "discord"
                                    ? "Opening Discord..."
                                    : "Continue with Discord"}
                            </span>
                        </button>
                        {oauthError ? (
                            <p className="timeline-auth-error" role="alert">
                                {oauthError}
                            </p>
                        ) : null}
                        <div className="timeline-auth-divider">or use email</div>
                    </>
                ) : null}
                {mode === "reset-complete" ? (
                    <button
                        className="focus-ring timeline-auth-email-submit timeline-auth-complete"
                        data-auth-initial-focus
                        onClick={finishRecovery}
                        type="button"
                    >
                        Continue to the timeline
                    </button>
                ) : (
                    <EmailAuthForm
                        busy={busy}
                        email={email}
                        mode={mode}
                        onEmailChange={handleEmailChange}
                        onPasswordChange={handlePasswordChange}
                        onPasswordConfirmationChange={handlePasswordConfirmationChange}
                        onSubmit={handleEmailAuth}
                        password={password}
                        passwordConfirmation={passwordConfirmation}
                        submitLabel={emailSubmitLabel}
                    />
                )}
                {emailError ? (
                    <p className="timeline-auth-error" role="alert">
                        {emailError}
                    </p>
                ) : null}
                {message ? (
                    <p aria-live="polite" className="timeline-auth-message">
                        {message}
                    </p>
                ) : null}
                <SecondaryActions
                    busy={busy}
                    mode={mode}
                    onForgotPassword={showForgotPassword}
                    onShowSignIn={showSignIn}
                    onToggleRegistration={toggleRegistration}
                />
            </section>
        </div>
    );
}
