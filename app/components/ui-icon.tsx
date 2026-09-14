import type { ReactNode } from "react";

type UiIconName =
    | "check"
    | "chevron-down"
    | "chevron-left"
    | "chevron-right"
    | "close"
    | "cloud-sync"
    | "diamond"
    | "external-link"
    | "globe"
    | "minus"
    | "reset"
    | "search"
    | "sign-out"
    | "sparkle"
    | "star"
    | "undo";

interface UiIconProps {
    className?: string;
    name: UiIconName;
}

const iconPaths: Record<UiIconName, ReactNode> = {
    check: <path d="m3.5 8.25 3 3 6-7" />,
    "chevron-down": <path d="m3 5.5 5 5 5-5" />,
    "chevron-left": <path d="m10.25 3.25-4.75 4.75 4.75 4.75" />,
    "chevron-right": <path d="m5.75 3.25 4.75 4.75-4.75 4.75" />,
    close: <path d="m4 4 8 8m0-8-8 8" />,
    "cloud-sync": (
        <>
            <path d="M4.25 11.75h7.25a2.4 2.4 0 0 0 .28-4.78A4.1 4.1 0 0 0 3.7 6.1a2.9 2.9 0 0 0 .55 5.65Z" />
            <path d="m6.25 8.1 1-1 1 1m1.5 1.8-1 1-1-1M7.25 7.2v1.35m1.5 2.25V9.45" />
        </>
    ),
    diamond: <path d="m8 2.5 5.5 5.5L8 13.5 2.5 8 8 2.5Z" />,
    "external-link": <path d="M4 12 12 4M6 4h6v6" />,
    globe: (
        <>
            <circle cx="8" cy="8" r="6" />
            <ellipse cx="8" cy="8" rx="2.5" ry="6" />
            <path d="M2 8h12" />
        </>
    ),
    minus: <path d="M3 8h10" />,
    reset: <path d="M4.2 5.2A5 5 0 1 1 3 9M3 4v4h4" />,
    search: <path d="m11.5 11.5 2.5 2.5m-1.5-7.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
    "sign-out": <path d="M6.5 3H3.75v10H6.5m2-8 3 3-3 3m-3-3h6" />,
    sparkle: (
        <path d="M8 1.8c.45 3.55 2.65 5.75 6.2 6.2-3.55.45-5.75 2.65-6.2 6.2C7.55 10.65 5.35 8.45 1.8 8 5.35 7.55 7.55 5.35 8 1.8Z" />
    ),
    star: (
        <path d="m8 1.8 1.85 3.75 4.15.6-3 2.92.7 4.13L8 11.25 4.3 13.2 5 9.07 2 6.15l4.15-.6L8 1.8Z" />
    ),
    undo: <path d="M6 4 2.5 7.5 6 11M3 7.5h5.2a4 4 0 0 1 4 4" />,
};

export function UiIcon({ className, name }: UiIconProps) {
    return (
        <svg
            aria-hidden="true"
            className={`ui-icon${className ? ` ${className}` : ""}`}
            fill="none"
            viewBox="0 0 16 16"
        >
            <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                {iconPaths[name]}
            </g>
        </svg>
    );
}
