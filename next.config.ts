import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : undefined;
const supabaseWebSocketOrigin = supabaseOrigin?.replace(/^http/, "ws");

const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
        "connect-src 'self'",
        "https://fonts.gstatic.com",
        "https://challenges.cloudflare.com",
        supabaseOrigin,
        supabaseWebSocketOrigin,
        production ? undefined : "ws: wss:",
    ]
        .filter(Boolean)
        .join(" "),
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    production ? "upgrade-insecure-requests" : undefined,
]
    .filter(Boolean)
    .join("; ");

const securityHeaders = [
    {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy,
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "X-Frame-Options",
        value: "DENY",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    },
    ...(production
        ? [
              {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
              },
          ]
        : []),
];

const nextConfig: NextConfig = {
    agentRules: false,
    async headers() {
        return [
            {
                headers: securityHeaders,
                source: "/(.*)",
            },
        ];
    },
    images: {
        remotePatterns: [
            {
                hostname: "image.tmdb.org",
                pathname: "/t/p/**",
                protocol: "https",
            },
            {
                hostname: "m.media-amazon.com",
                protocol: "https",
            },
        ],
    },
    poweredByHeader: false,
};

export default nextConfig;
