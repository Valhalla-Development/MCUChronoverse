"use client";

import {
    Image as DreiImage,
    OrbitControls,
    PerformanceMonitor,
    Text,
    useCursor,
} from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
    type RefCallback,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type Camera,
    CatmullRomCurve3,
    Color,
    type Curve,
    DynamicDrawUsage,
    Euler,
    type Group,
    type InstancedMesh,
    LineCurve3,
    type Material,
    MathUtils,
    Matrix4,
    type Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    Quaternion,
    ShaderMaterial,
    SphereGeometry,
    TorusGeometry,
    TubeGeometry,
    Vector3,
} from "three";
import { configureTextBuilder } from "troika-three-text";
import type { TimelineEntry } from "../data/types";
import { timelineNodePosition } from "../lib/timeline";
import { createTimelineConnectorVolume } from "../lib/timeline-connector-volume";
import { cardAccentColours, getTimelineNodeAccent } from "../lib/timeline-node-accent";
import {
    createTimelineNodeCoreMaterial,
    createTimelineNodeFilamentMaterial,
    createTimelineNodeMaterial,
} from "../lib/timeline-node-material";
import { createTimelineRingMaterial } from "../lib/timeline-ring-material";
import { CosmicBackground } from "./cosmic-background";
import { TimelineEnergy } from "./timeline-energy";

// Troika's worker hydrates functions from strings, which strict production CSP deliberately blocks.
// Main-thread typesetting remains asynchronous and only runs when card text changes.
configureTextBuilder({ useWorker: false });

const TIMELINE_CARD_FOCUS_OFFSET_Y = 1.28;

const CARD_WIDTH = 1.32;
const CARD_BASE_HEIGHT = 1.86;
const CARD_RADIUS = 0.085;
const CARD_GAP_FROM_ORB = 0.65;
const CARD_PADDING = 0.008;
// The 65% artwork over a 60% surface leaves a subtle 14% background bleed.
const POSTER_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
const POSTER_HEIGHT = CARD_BASE_HEIGHT - CARD_PADDING * 2;
const META_LEFT = -CARD_WIDTH / 2 + CARD_PADDING + 0.085;
const META_FONT_SIZE = 0.067;
const TITLE_FONT_SIZE = 0.102;
const CARD_TEXT_WIDTH = CARD_WIDTH - (CARD_PADDING + 0.085) * 2;
const CARD_BOTTOM_INSET = CARD_PADDING + 0.085;
const CARD_META_GAP = 0.115;
const CARD_RENDER_ORDER_BASE = 1000;
const SELECTED_CARD_RENDER_ORDER = 2000;
const CARD_PLANE_GEOMETRY = new PlaneGeometry(1, 1);
const CARD_HIT_MATERIAL = new MeshBasicMaterial({ visible: false });
const POSTER_TEXTURE_WIDTH = 640;
const NODE_SPHERE_GEOMETRY = new SphereGeometry(0.11, 24, 24);
const NODE_LIFT = 0.3;
// Each arm merges tangentially into the stream and curls gently into the raised core.
const NODE_FILAMENT_CURVE = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0.2, -0.025, 0.035),
    new Vector3(0.5, -NODE_LIFT + 0.025, 0.02),
    new Vector3(0.82, -NODE_LIFT, 0),
]);
const NODE_FILAMENT_GEOMETRY = new TubeGeometry(NODE_FILAMENT_CURVE, 32, 0.085, 12, false);
const NORMAL_OUTER_RING_GEOMETRY = new TorusGeometry(0.223, 0.003, 8, 48);
const SELECTED_OUTER_RING_GEOMETRY = new TorusGeometry(0.284, 0.004, 8, 48);
const NORMAL_INNER_RING_GEOMETRY = new TorusGeometry(0.185, 0.0025, 8, 40);
const SELECTED_INNER_RING_GEOMETRY = new TorusGeometry(0.231, 0.003, 8, 40);
const CARD_CONNECTION_CURVE = new LineCurve3(new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0));
const CARD_CONNECTION_GEOMETRY = new TubeGeometry(
    // The shader varies the middle of each link while keeping its exit centred on the orb.
    CARD_CONNECTION_CURVE,
    32,
    0.07,
    12,
    false
);
const NODE_FILAMENT_VOLUME = createTimelineConnectorVolume(NODE_FILAMENT_CURVE);
const CARD_CONNECTION_VOLUME = createTimelineConnectorVolume(CARD_CONNECTION_CURVE, true);
const CONNECTOR_EFFECTS = {
    surface: {
        arm: {
            createMaterial: createTimelineNodeFilamentMaterial,
            geometry: NODE_FILAMENT_GEOMETRY,
        },
        card: {
            createMaterial: () => createTimelineNodeFilamentMaterial({ cardConnection: true }),
            geometry: CARD_CONNECTION_GEOMETRY,
        },
    },
    volumetric: { arm: NODE_FILAMENT_VOLUME, card: CARD_CONNECTION_VOLUME },
};
// Switch to .surface to restore the previous connector effect without changing geometry settings.
const CONNECTOR_EFFECT = CONNECTOR_EFFECTS.volumetric;
// Draw the pill and checkmark together so their edges remain aligned as the card scales.
const WATCHED_BADGE_MATERIAL = new ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: /* glsl */ `
        varying vec2 vUv;

        float roundedBoxDistance(vec2 point, vec2 bounds, float radius) {
            vec2 offset = abs(point) - bounds + radius;
            return length(max(offset, 0.0)) + min(max(offset.x, offset.y), 0.0) - radius;
        }

        float segmentDistance(vec2 p, vec2 a, vec2 b) {
            vec2 ab = b - a;
            return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
        }

        void main() {
            vec2 point = (vUv - 0.5) * vec2(2.65, 1.0);
            float pillDistance = roundedBoxDistance(point, vec2(1.28, 0.43), 0.43);
            float pillAa = max(fwidth(pillDistance), 0.002);
            float pill = 1.0 - smoothstep(-pillAa, pillAa, pillDistance);

            float innerDistance = roundedBoxDistance(point, vec2(1.24, 0.39), 0.39);
            float inner = 1.0 - smoothstep(-pillAa, pillAa, innerDistance);
            float rim = max(pill - inner, 0.0);

            vec2 tickPoint = point - vec2(-0.91, 0.0);
            float tickDistance = min(
                segmentDistance(tickPoint, vec2(-0.12, 0.01), vec2(-0.02, -0.09)),
                segmentDistance(tickPoint, vec2(-0.02, -0.09), vec2(0.17, 0.12))
            );
            float tickAa = max(fwidth(tickDistance), 0.002);
            float tick = 1.0 - smoothstep(0.026 - tickAa, 0.026 + tickAa, tickDistance);

            vec3 glass = vec3(0.035, 0.042, 0.05);
            vec3 colour = mix(glass, vec3(0.22), rim * 0.5);
            colour = mix(colour, vec3(0.96), tick);
            float alpha = inner * 0.76 + rim * 0.34;

            gl_FragColor = vec4(colour, alpha * pill);
            #include <colorspace_fragment>
        }
    `,
    toneMapped: false,
    transparent: true,
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
});
const NORMAL_OUTER_RING_MATERIAL = createTimelineRingMaterial({
    colour: "#ffffff",
    opacity: 0.45,
});
const SELECTED_OUTER_RING_MATERIAL = createTimelineRingMaterial({
    colour: "#ffffff",
    opacity: 0.9,
});
const INNER_RING_MATERIAL = createTimelineRingMaterial({
    colour: "#ffffff",
    opacity: 0.32,
});
const NODE_SPHERE_MATERIAL = createTimelineNodeCoreMaterial();
const SELECTED_NODE_SPHERE_MATERIAL = createTimelineNodeCoreMaterial();
// Explicit font files determine glyph weight in Troika; fontWeight cannot restyle a loaded face.
const GEIST_FONT_URL =
    "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RnOM4nQ.ttf";
const GEIST_MEDIUM_FONT_URL =
    "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RruM4nQ.ttf";
const GEIST_SEMIBOLD_FONT_URL =
    "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf";
const GEIST_MONO_FONT_URL =
    "https://fonts.gstatic.com/s/geistmono/v6/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5T.ttf";
const CARD_TITLE_CHARACTERS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&'*():-.,/!? ";
const CARD_META_CHARACTERS = `${CARD_TITLE_CHARACTERS}•`;
const NARROW_TITLE_CHARACTER_PATTERN = /[ilI1'.,:]/;
const WIDE_TITLE_CHARACTER_PATTERN = /[MW@%]/;
const WHITESPACE_CHARACTER_PATTERN = /\s/;
const UPPERCASE_CHARACTER_PATTERN = /[A-Z]/;

const contentTypeNames: Record<TimelineEntry["contentType"], string> = {
    film: "Film",
    "one-shot": "One-Shot",
    series: "Series",
    short: "Short",
    special: "Special",
};

const MIN_ZOOM_DISTANCE = 6;
const MAX_ZOOM_DISTANCE = 18;
const DEFAULT_ZOOM_DISTANCE = (MIN_ZOOM_DISTANCE + MAX_ZOOM_DISTANCE) / 2;
const ZOOM_STORAGE_KEY = "mcu-chronoverse:zoom-distance-v2";

const panelVertexShader = /* glsl */ `
    varying vec2 vPanelUv;
    varying vec2 vPanelSize;

    void main() {
        vPanelUv = uv;
        vPanelSize = vec2(
            length(modelMatrix[0].xyz),
            length(modelMatrix[1].xyz)
        );
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const cardPanelFragmentShader = /* glsl */ `
    uniform vec3 uAccentColour;
    uniform vec3 uBorderColour;
    uniform vec3 uSurfaceColour;
    uniform float uBorderOpacity;
    uniform float uHighlighted;
    uniform float uSurfaceOpacity;
    varying vec2 vPanelUv;
    varying vec2 vPanelSize;

    float roundedBoxDistance(vec2 point, vec2 bounds, float radius) {
        vec2 offset = abs(point) - bounds + radius;
        return length(max(offset, 0.0)) + min(max(offset.x, offset.y), 0.0) - radius;
    }

    float shapeMask(float distanceToEdge, float antialiasWidth) {
        return 1.0 - smoothstep(-antialiasWidth, antialiasWidth, distanceToEdge);
    }

    vec4 composite(vec4 below, vec4 above) {
        float alpha = above.a + below.a * (1.0 - above.a);
        vec3 colour = alpha > 0.0001
            ? (above.rgb * above.a + below.rgb * below.a * (1.0 - above.a)) / alpha
            : vec3(0.0);
        return vec4(colour, alpha);
    }

    void main() {
        vec2 panelSize = max(vPanelSize, vec2(0.0001));
        vec2 point = (vPanelUv - 0.5) * panelSize;
        float unitScale = panelSize.x / ${CARD_WIDTH + 0.08};
        vec2 cardSize = panelSize - vec2(0.08, 0.10) * unitScale;
        vec2 cardBounds = cardSize * 0.5;
        float cardRadius = ${CARD_RADIUS} * unitScale;
        float borderWidth = 0.0065 * unitScale;

        // A soft shadow separates overlapping cards from the background.
        float shadowDistance = roundedBoxDistance(
            point - vec2(0.0, -0.035 * unitScale),
            cardBounds + vec2(0.028) * unitScale,
            (${CARD_RADIUS} + 0.035) * unitScale
        );
        float shadowAa = max(fwidth(shadowDistance), 0.0008);
        vec4 result = vec4(0.0, 0.0, 0.0, shapeMask(shadowDistance, shadowAa) * 0.34);

        // A thin accent halo identifies the focused card.
        float glowDistance = roundedBoxDistance(
            point,
            cardBounds + vec2(0.022) * unitScale,
            (${CARD_RADIUS} + 0.028) * unitScale
        );
        float glowAa = max(fwidth(glowDistance), 0.0008);
        float glowOuter = shapeMask(glowDistance, glowAa);
        float glowInner = shapeMask(glowDistance + 0.018 * unitScale, glowAa);
        float glowRing = max(glowOuter - glowInner, 0.0);
        result = composite(result, vec4(uAccentColour, glowRing * 0.18 * uHighlighted));

        float distanceToEdge = roundedBoxDistance(point, cardBounds, cardRadius);
        float aa = max(fwidth(distanceToEdge), 0.0008);
        float outerMask = shapeMask(distanceToEdge, aa);
        float innerMask = shapeMask(distanceToEdge + borderWidth, aa);
        float borderMask = max(outerMask - innerMask, 0.0);

        vec3 borderColour = mix(uBorderColour, uAccentColour, uHighlighted);
        vec3 colour = mix(borderColour, uSurfaceColour, innerMask);
        float alpha = innerMask * uSurfaceOpacity + borderMask * uBorderOpacity;
        result = composite(result, vec4(colour, alpha * outerMask));

        gl_FragColor = result;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

const posterShadeFragmentShader = /* glsl */ `
    varying vec2 vPanelUv;

    void main() {
        // Keep the artwork visible above a solid, readable footer, including long titles.
        float bottomShade = 1.0 - smoothstep(0.12, 0.62, vPanelUv.y);
        float edgeShade = smoothstep(0.30, 0.5, abs(vPanelUv.x - 0.5)) * 0.14;
        float topShade = smoothstep(0.72, 1.0, vPanelUv.y) * 0.18;
        float alpha = clamp(bottomShade + edgeShade + topShade, 0.0, 1.0);

        // Match the artwork's rounded corners so the fade cannot square off the frame.
        vec2 size = vec2(${POSTER_WIDTH}, ${POSTER_HEIGHT});
        float radius = ${CARD_RADIUS - CARD_PADDING};
        vec2 offset = abs((vPanelUv - 0.5) * size) - size * 0.5 + radius;
        float distanceToEdge = length(max(offset, 0.0))
            + min(max(offset.x, offset.y), 0.0) - radius;
        float aa = max(fwidth(distanceToEdge), 0.0008);
        float mask = 1.0 - smoothstep(-aa, aa, distanceToEdge);

        gl_FragColor = vec4(0.002, 0.003, 0.004, alpha * mask);
        #include <colorspace_fragment>
    }
`;

function createCardSurfaceMaterial(
    accentColour: string,
    highlighted: boolean,
    watched = false
): ShaderMaterial {
    const idleBorderOpacity = watched ? 0.64 : 0.58;
    return new ShaderMaterial({
        // Respect scene depth while preserving transparent layer ordering.
        depthTest: true,
        depthWrite: false,
        fragmentShader: cardPanelFragmentShader,
        toneMapped: false,
        transparent: true,
        uniforms: {
            uAccentColour: { value: new Color(accentColour) },
            uBorderColour: { value: new Color("#a8afb8") },
            uBorderOpacity: { value: highlighted ? 0.9 : idleBorderOpacity },
            uHighlighted: { value: highlighted ? 1 : 0 },
            uSurfaceColour: { value: new Color("#05070a") },
            uSurfaceOpacity: { value: 0.6 },
        },
        vertexShader: panelVertexShader,
    });
}

type CardSurfaceMaterialSet = Record<
    TimelineEntry["contentType"],
    Record<"highlighted" | "idle" | "watched", ShaderMaterial>
>;

const cardSurfaceMaterials = {
    film: {
        highlighted: createCardSurfaceMaterial(cardAccentColours.film, true),
        idle: createCardSurfaceMaterial(cardAccentColours.film, false),
        watched: createCardSurfaceMaterial(cardAccentColours.film, false, true),
    },
    "one-shot": {
        highlighted: createCardSurfaceMaterial(cardAccentColours["one-shot"], true),
        idle: createCardSurfaceMaterial(cardAccentColours["one-shot"], false),
        watched: createCardSurfaceMaterial(cardAccentColours["one-shot"], false, true),
    },
    series: {
        highlighted: createCardSurfaceMaterial(cardAccentColours.series, true),
        idle: createCardSurfaceMaterial(cardAccentColours.series, false),
        watched: createCardSurfaceMaterial(cardAccentColours.series, false, true),
    },
    short: {
        highlighted: createCardSurfaceMaterial(cardAccentColours.short, true),
        idle: createCardSurfaceMaterial(cardAccentColours.short, false),
        watched: createCardSurfaceMaterial(cardAccentColours.short, false, true),
    },
    special: {
        highlighted: createCardSurfaceMaterial(cardAccentColours.special, true),
        idle: createCardSurfaceMaterial(cardAccentColours.special, false),
        watched: createCardSurfaceMaterial(cardAccentColours.special, false, true),
    },
} satisfies CardSurfaceMaterialSet;

const posterShadeMaterial = new ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: posterShadeFragmentShader,
    toneMapped: false,
    transparent: true,
    vertexShader: panelVertexShader,
});

function configureOverlayMesh(mesh: Mesh | null): void {
    if (!mesh) {
        return;
    }
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
        material.depthTest = true;
        material.depthWrite = false;
        material.toneMapped = false;
    }
}

function getPosterTextureUrl(url: string): string {
    return `/_next/image?url=${encodeURIComponent(url)}&w=${POSTER_TEXTURE_WIDTH}&q=75`;
}

function titleWidthUnits(value: string): number {
    let width = 0;
    for (const character of value) {
        if (NARROW_TITLE_CHARACTER_PATTERN.test(character)) {
            width += 0.3;
        } else if (WIDE_TITLE_CHARACTER_PATTERN.test(character)) {
            width += 0.9;
        } else if (WHITESPACE_CHARACTER_PATTERN.test(character)) {
            width += 0.32;
        } else if (UPPERCASE_CHARACTER_PATTERN.test(character)) {
            width += 0.64;
        } else {
            width += 0.52;
        }
    }
    return width;
}

interface TimelineOrbitProps {
    entries: readonly TimelineEntry[];
    focusIndex: number;
    focusKey: number;
    onSelect: (slug: string) => void;
    selectedSlug?: string;
    watchedSlugs: readonly string[];
}

interface TimelineNodeProps {
    billboardRef: RefCallback<Group>;
    cardRef: RefCallback<Group>;
    count: number;
    entry: TimelineEntry;
    highlighted: boolean;
    index: number;
    onCardPointerOut: (event: ThreeEvent<PointerEvent>) => void;
    onCardPointerOver: (event: ThreeEvent<PointerEvent>) => void;
    onCardSelect: (event: ThreeEvent<MouseEvent>) => void;
    watched: boolean;
}

interface TimelinePosterCardProps {
    billboardRef: RefCallback<Group>;
    cardRef: RefCallback<Group>;
    entry: TimelineEntry;
    highlighted: boolean;
    onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
    onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
    onSelect: (event: ThreeEvent<MouseEvent>) => void;
    watched: boolean;
}

function PosterArtwork({
    entry,
    posterPositionY,
    renderOrder,
}: {
    entry: TimelineEntry;
    posterPositionY: number;
    renderOrder: number;
}) {
    if (entry.posterUrl) {
        return (
            <DreiImage
                frustumCulled={false}
                opacity={0.9}
                position={[0, posterPositionY, 0]}
                radius={CARD_RADIUS - CARD_PADDING}
                ref={configureOverlayMesh}
                renderOrder={renderOrder}
                scale={[POSTER_WIDTH, POSTER_HEIGHT]}
                toneMapped={false}
                transparent
                url={getPosterTextureUrl(entry.posterUrl)}
            />
        );
    }

    return (
        <PosterFallback entry={entry} posterPositionY={posterPositionY} renderOrder={renderOrder} />
    );
}

function PosterFallback({
    entry,
    posterPositionY,
    renderOrder,
}: {
    entry: TimelineEntry;
    posterPositionY: number;
    renderOrder: number;
}) {
    return (
        <Text
            anchorX="center"
            anchorY="middle"
            characters={CARD_META_CHARACTERS}
            color={cardAccentColours[entry.contentType]}
            font={GEIST_MONO_FONT_URL}
            fontSize={0.4}
            frustumCulled={false}
            position={[0, posterPositionY, 0]}
            ref={configureOverlayMesh}
            renderOrder={renderOrder}
        >
            {entry.title.slice(0, 1)}
        </Text>
    );
}

function TimelinePosterCard({
    billboardRef,
    cardRef,
    entry,
    highlighted,
    onPointerOut,
    onPointerOver,
    onSelect,
    watched,
}: TimelinePosterCardProps) {
    const cardMeta = [entry.placement, contentTypeNames[entry.contentType], entry.runtime]
        .filter(Boolean)
        .join("  •  ");
    // Keep chronology ranges and episode runtimes inside the same compact metadata row.
    const metaFontSize = Math.min(
        META_FONT_SIZE,
        CARD_TEXT_WIDTH / (titleWidthUnits(cardMeta) + 1)
    );
    const cardHeight = CARD_BASE_HEIGHT;
    const posterPositionY = 0;
    const metaBottom = -cardHeight / 2 + CARD_BOTTOM_INSET;
    const titleBottom = metaBottom + CARD_META_GAP;
    // Coplanar artwork, frame and text stay aligned off-axis. Transparent materials
    // disable depth writes, so renderOrder alone controls their stacking.
    const renderOrder = 100;
    const idleSurface = watched ? "watched" : "idle";
    const watchedBadgeX = META_LEFT + 0.225;
    const watchedBadgeY = CARD_BASE_HEIGHT / 2 - 0.16;

    return (
        <group position={[0, cardHeight / 2 + CARD_GAP_FROM_ORB, 0]} ref={billboardRef}>
            <group ref={cardRef} renderOrder={CARD_RENDER_ORDER_BASE}>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: The hidden mesh is the card's scene hit target. */}
                <mesh
                    onClick={onSelect}
                    onPointerOut={onPointerOut}
                    onPointerOver={onPointerOver}
                    position={[0, 0, 0.04]}
                    scale={[CARD_WIDTH, cardHeight, 1]}
                    userData={{ timelineSlug: entry.slug }}
                    visible={false}
                >
                    <primitive attach="geometry" object={CARD_PLANE_GEOMETRY} />
                    <primitive attach="material" object={CARD_HIT_MATERIAL} />
                </mesh>

                <mesh
                    frustumCulled={false}
                    renderOrder={renderOrder + 2}
                    scale={[CARD_WIDTH + 0.08, cardHeight + 0.1, 1]}
                >
                    <primitive attach="geometry" object={CARD_PLANE_GEOMETRY} />
                    <primitive
                        attach="material"
                        object={
                            cardSurfaceMaterials[entry.contentType][
                                highlighted ? "highlighted" : idleSurface
                            ]
                        }
                    />
                </mesh>

                <Suspense
                    fallback={
                        <PosterFallback
                            entry={entry}
                            posterPositionY={posterPositionY}
                            renderOrder={renderOrder + 5}
                        />
                    }
                >
                    <PosterArtwork
                        entry={entry}
                        posterPositionY={posterPositionY}
                        renderOrder={renderOrder + 5}
                    />
                </Suspense>

                {/* Full-poster cinematic fade: keeps text readable without a separate black info box. */}
                <mesh
                    frustumCulled={false}
                    position={[0, posterPositionY, 0]}
                    renderOrder={renderOrder + 6}
                    scale={[POSTER_WIDTH, POSTER_HEIGHT, 1]}
                >
                    <primitive attach="geometry" object={CARD_PLANE_GEOMETRY} />
                    <primitive attach="material" object={posterShadeMaterial} />
                </mesh>

                {watched ? (
                    <>
                        <mesh
                            geometry={CARD_PLANE_GEOMETRY}
                            material={WATCHED_BADGE_MATERIAL}
                            position={[watchedBadgeX, watchedBadgeY, 0]}
                            renderOrder={renderOrder + 8}
                            scale={[0.45, 0.17, 1]}
                        />
                        <Text
                            anchorX="center"
                            anchorY="middle"
                            characters={CARD_META_CHARACTERS}
                            color="#f4f1e8"
                            fillOpacity={0.94}
                            font={GEIST_MEDIUM_FONT_URL}
                            fontSize={0.059}
                            frustumCulled={false}
                            letterSpacing={0}
                            position={[watchedBadgeX + 0.035, watchedBadgeY, 0]}
                            ref={configureOverlayMesh}
                            renderOrder={renderOrder + 9}
                            whiteSpace="nowrap"
                        >
                            Watched
                        </Text>
                    </>
                ) : null}

                <Text
                    anchorX="left"
                    anchorY="bottom"
                    characters={CARD_TITLE_CHARACTERS}
                    color="#f3f4f5"
                    fillOpacity={1}
                    font={GEIST_SEMIBOLD_FONT_URL}
                    fontSize={TITLE_FONT_SIZE}
                    fontWeight={600}
                    frustumCulled={false}
                    letterSpacing={-0.018}
                    lineHeight={1.16}
                    maxWidth={CARD_TEXT_WIDTH}
                    overflowWrap="normal"
                    position={[META_LEFT, titleBottom, 0]}
                    ref={configureOverlayMesh}
                    renderOrder={renderOrder + 8}
                    whiteSpace="normal"
                >
                    {entry.title}
                </Text>

                <Text
                    anchorX="left"
                    anchorY="bottom"
                    characters={CARD_META_CHARACTERS}
                    color="#a6adb5"
                    fillOpacity={1}
                    font={GEIST_FONT_URL}
                    fontSize={metaFontSize}
                    frustumCulled={false}
                    letterSpacing={0}
                    maxWidth={CARD_TEXT_WIDTH}
                    position={[META_LEFT, metaBottom, 0]}
                    ref={configureOverlayMesh}
                    renderOrder={renderOrder + 8}
                    whiteSpace="nowrap"
                >
                    {cardMeta}
                </Text>
            </group>
        </group>
    );
}

interface TimelineNodeInstance {
    entry: TimelineEntry;
    position: Vector3;
}

interface InstancedNodeSphereGroupProps {
    instances: readonly TimelineNodeInstance[];
    material: ShaderMaterial;
    onHoverChange: (hovered: boolean) => void;
    onSelect: (slug: string) => void;
}

function InstancedNodeSphereGroup({
    instances,
    material,
    onHoverChange,
    onSelect,
}: InstancedNodeSphereGroupProps) {
    const meshRef = useRef<InstancedMesh>(null);
    const matrix = useMemo(() => new Matrix4(), []);

    useLayoutEffect(() => {
        const mesh = meshRef.current as InstancedMesh;
        const colour = new Color();
        instances.forEach(({ entry, position }, instanceId) => {
            matrix.makeTranslation(position.x, position.y, position.z);
            mesh.setMatrixAt(instanceId, matrix);
            mesh.setColorAt(instanceId, colour.set(getTimelineNodeAccent(entry)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [instances, matrix]);

    const handleSelect = useCallback(
        (event: ThreeEvent<MouseEvent>) => {
            const instance = instances[event.instanceId ?? -1];
            if (!instance) {
                return;
            }
            event.stopPropagation();
            onSelect(instance.entry.slug);
        },
        [instances, onSelect]
    );
    const handlePointerOver = useCallback(
        (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            onHoverChange(true);
        },
        [onHoverChange]
    );
    const handlePointerOut = useCallback(
        (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            onHoverChange(false);
        },
        [onHoverChange]
    );

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: The instanced orbs are scene controls.
        <instancedMesh
            args={[NODE_SPHERE_GEOMETRY, material, instances.length]}
            frustumCulled={false}
            onClick={handleSelect}
            onPointerOut={handlePointerOut}
            onPointerOver={handlePointerOver}
            ref={meshRef}
        />
    );
}

interface InstancedTimelineRingsProps {
    instances: readonly TimelineNodeInstance[];
    reducedMotion: boolean;
    selected?: TimelineNodeInstance;
}

function InstancedTimelineRings({
    instances,
    reducedMotion,
    selected,
}: InstancedTimelineRingsProps) {
    const normalOuterRef = useRef<InstancedMesh>(null);
    const normalInnerRef = useRef<InstancedMesh>(null);
    const selectedOuterRef = useRef<InstancedMesh>(null);
    const selectedInnerRef = useRef<InstancedMesh>(null);
    const matrix = useMemo(() => new Matrix4(), []);
    const groupEuler = useMemo(() => new Euler(), []);
    const groupQuaternion = useMemo(() => new Quaternion(), []);
    const innerQuaternion = useMemo(() => new Quaternion().setFromEuler(new Euler(0.8, 0, 0)), []);
    const ringQuaternion = useMemo(() => new Quaternion(), []);
    const scale = useMemo(() => new Vector3(1, 1, 1), []);

    useLayoutEffect(() => {
        for (const mesh of [
            normalOuterRef.current,
            normalInnerRef.current,
            selectedOuterRef.current,
            selectedInnerRef.current,
        ]) {
            mesh?.instanceMatrix.setUsage(DynamicDrawUsage);
        }
    }, []);

    useLayoutEffect(() => {
        const colour = new Color();
        for (const mesh of [normalOuterRef.current, normalInnerRef.current]) {
            if (!mesh) {
                continue;
            }
            instances.forEach(({ entry }, index) => {
                mesh.setColorAt(index, colour.set(getTimelineNodeAccent(entry)));
            });
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }
        }
        for (const mesh of [selectedOuterRef.current, selectedInnerRef.current]) {
            if (mesh && selected) {
                mesh.setColorAt(0, colour.set(getTimelineNodeAccent(selected.entry)));
                if (mesh.instanceColor) {
                    mesh.instanceColor.needsUpdate = true;
                }
            }
        }
    }, [instances, selected]);

    const updateRings = useCallback(
        (elapsed: number) => {
            NORMAL_OUTER_RING_MATERIAL.uniforms.uTime.value = elapsed;
            SELECTED_OUTER_RING_MATERIAL.uniforms.uTime.value = elapsed;
            INNER_RING_MATERIAL.uniforms.uTime.value = elapsed;
            groupEuler.set(elapsed * 0.055, 1.05, 0);
            groupQuaternion.setFromEuler(groupEuler);

            const writeInstances = (mesh: InstancedMesh | null, inner: boolean) => {
                if (!mesh) {
                    return;
                }
                const quaternion = inner
                    ? ringQuaternion.copy(groupQuaternion).multiply(innerQuaternion)
                    : groupQuaternion;
                instances.forEach(({ position }, instanceId) => {
                    matrix.compose(position, quaternion, scale);
                    mesh.setMatrixAt(instanceId, matrix);
                });
                mesh.instanceMatrix.needsUpdate = true;
            };
            writeInstances(normalOuterRef.current, false);
            writeInstances(normalInnerRef.current, true);

            const writeSelected = (mesh: InstancedMesh | null, inner: boolean) => {
                if (!(mesh && selected)) {
                    return;
                }
                const quaternion = inner
                    ? ringQuaternion.copy(groupQuaternion).multiply(innerQuaternion)
                    : groupQuaternion;
                matrix.compose(selected.position, quaternion, scale);
                mesh.setMatrixAt(0, matrix);
                mesh.instanceMatrix.needsUpdate = true;
            };
            writeSelected(selectedOuterRef.current, false);
            writeSelected(selectedInnerRef.current, true);
        },
        [
            groupEuler,
            groupQuaternion,
            innerQuaternion,
            instances,
            matrix,
            ringQuaternion,
            scale,
            selected,
        ]
    );

    useLayoutEffect(() => updateRings(0), [updateRings]);
    useFrame(({ clock }) => updateRings(reducedMotion ? 0 : clock.elapsedTime));

    return (
        <>
            <instancedMesh
                args={[NORMAL_OUTER_RING_GEOMETRY, NORMAL_OUTER_RING_MATERIAL, instances.length]}
                frustumCulled={false}
                ref={normalOuterRef}
            />
            <instancedMesh
                args={[NORMAL_INNER_RING_GEOMETRY, INNER_RING_MATERIAL, instances.length]}
                frustumCulled={false}
                ref={normalInnerRef}
            />
            {selected ? (
                <>
                    <instancedMesh
                        args={[SELECTED_OUTER_RING_GEOMETRY, SELECTED_OUTER_RING_MATERIAL, 1]}
                        frustumCulled={false}
                        ref={selectedOuterRef}
                    />
                    <instancedMesh
                        args={[SELECTED_INNER_RING_GEOMETRY, INNER_RING_MATERIAL, 1]}
                        frustumCulled={false}
                        ref={selectedInnerRef}
                    />
                </>
            ) : null}
        </>
    );
}

function TimelineNodeGlow({ instances, reducedMotion, selected }: InstancedTimelineRingsProps) {
    const meshRef = useRef<InstancedMesh>(null);
    const material = useMemo(createTimelineNodeMaterial, []);
    useEffect(() => () => material.dispose(), [material]);
    useLayoutEffect(() => {
        const mesh = meshRef.current as InstancedMesh;
        const matrix = new Matrix4();
        const colour = new Color();
        instances.forEach(({ entry, position }, index) => {
            const focused = entry.slug === selected?.entry.slug;
            // Scale encodes focus for the shader; translation remains the original anchor.
            matrix.makeScale(focused ? 2 : 1, 1, 1).setPosition(position);
            mesh.setMatrixAt(index, matrix);
            mesh.setColorAt(index, colour.set(getTimelineNodeAccent(entry)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [instances, selected]);
    useFrame(({ clock }) => {
        material.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
        material.uniforms.uMotion.value = reducedMotion ? 0 : 1;
    });
    return (
        <instancedMesh
            args={[CARD_PLANE_GEOMETRY, material, instances.length]}
            frustumCulled={false}
            ref={meshRef}
            renderOrder={3}
        />
    );
}

interface TimelineNodeFilamentsProps extends InstancedTimelineRingsProps {
    curve: Curve<Vector3>;
}

function TimelineNodeFilaments({ curve, instances, reducedMotion }: TimelineNodeFilamentsProps) {
    const meshRef = useRef<InstancedMesh>(null);
    const material = useMemo(CONNECTOR_EFFECT.arm.createMaterial, []);
    useEffect(() => () => material.dispose(), [material]);
    useLayoutEffect(() => {
        const mesh = meshRef.current as InstancedMesh;
        const matrix = new Matrix4();
        const colour = new Color();
        const rotation = new Quaternion();
        const scale = new Vector3();
        const target = new Vector3();
        const armVector = new Vector3();
        const sourceVector = new Vector3();
        const targetDirection = new Vector3();
        const armReach = NODE_FILAMENT_CURVE.getPoint(1).length();
        const segmentFraction = 0.82 / 2.2;
        const finalIndex = Math.max(instances.length - 1, 1);
        let armIndex = 0;
        instances.forEach(({ entry, position }, index) => {
            for (const direction of [-1, 1]) {
                // End anchors only draw the arm that joins the existing stream.
                if (
                    (index === 0 && direction === -1) ||
                    (index === instances.length - 1 && direction === 1)
                ) {
                    continue;
                }
                const curveProgress = MathUtils.clamp(
                    (index + direction * segmentFraction) / finalIndex,
                    0,
                    1
                );
                curve.getPoint(curveProgress, target);
                armVector.copy(target).sub(position);
                sourceVector.set(0.82, -NODE_LIFT, 0);
                targetDirection.copy(armVector).normalize();
                rotation.setFromUnitVectors(sourceVector.normalize(), targetDirection);
                scale.setScalar(armVector.length() / armReach);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(armIndex, matrix);
                mesh.setColorAt(armIndex, colour.set(getTimelineNodeAccent(entry)));
                armIndex += 1;
            }
        });
        mesh.count = armIndex;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [curve, instances]);
    useFrame(({ clock }) => {
        material.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
        material.uniforms.uMotion.value = reducedMotion ? 0 : 1;
    });
    return (
        <instancedMesh
            args={[CONNECTOR_EFFECT.arm.geometry, material, instances.length * 2]}
            frustumCulled={false}
            ref={meshRef}
            renderOrder={3}
        />
    );
}

interface InstancedTimelineNodesProps {
    count: number;
    curve: Curve<Vector3>;
    entries: readonly TimelineEntry[];
    onSelect: (slug: string) => void;
    reducedMotion: boolean;
    selectedSlug?: string;
}

function InstancedTimelineNodes({
    count,
    curve,
    entries,
    onSelect,
    selectedSlug,
    reducedMotion,
}: InstancedTimelineNodesProps) {
    const [hovered, setHovered] = useState(false);
    useCursor(hovered);
    const instances = useMemo(
        () =>
            entries.map((entry, index) => {
                const position = timelineNodePosition(index, count);
                return {
                    entry,
                    position: new Vector3(position.x, position.y + NODE_LIFT, position.z),
                };
            }),
        [count, entries]
    );
    const selected = instances.find(({ entry }) => entry.slug === selectedSlug);
    useLayoutEffect(() => {
        if (selected) {
            SELECTED_NODE_SPHERE_MATERIAL.uniforms.uAccent.value = new Color(
                getTimelineNodeAccent(selected.entry)
            );
        }
    }, [selected]);
    const normalInstances = useMemo(
        () =>
            selectedSlug ? instances.filter(({ entry }) => entry.slug !== selectedSlug) : instances,
        [instances, selectedSlug]
    );
    const handleSelectedSelect = useCallback(
        (event: ThreeEvent<MouseEvent>) => {
            if (!selectedSlug) {
                return;
            }
            event.stopPropagation();
            onSelect(selectedSlug);
        },
        [onSelect, selectedSlug]
    );
    const handleSelectedPointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHovered(false);
    }, []);
    const handleSelectedPointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHovered(true);
    }, []);

    return (
        <>
            <TimelineNodeFilaments
                curve={curve}
                instances={instances}
                reducedMotion={reducedMotion}
            />
            <TimelineNodeGlow
                instances={instances}
                reducedMotion={reducedMotion}
                selected={selected}
            />
            <InstancedTimelineRings
                instances={normalInstances}
                reducedMotion={reducedMotion}
                selected={selected}
            />
            <InstancedNodeSphereGroup
                instances={normalInstances}
                material={NODE_SPHERE_MATERIAL}
                onHoverChange={setHovered}
                onSelect={onSelect}
            />
            {selected ? (
                // biome-ignore lint/a11y/noStaticElementInteractions: The selected orb is a scene control.
                <mesh
                    frustumCulled={false}
                    onClick={handleSelectedSelect}
                    onPointerOut={handleSelectedPointerOut}
                    onPointerOver={handleSelectedPointerOver}
                    position={selected.position}
                    scale={1.25}
                >
                    <primitive attach="geometry" object={NODE_SPHERE_GEOMETRY} />
                    <primitive attach="material" object={SELECTED_NODE_SPHERE_MATERIAL} />
                </mesh>
            ) : null}
        </>
    );
}

// Cards remain individual GPU layers while one controller batches their billboard transforms.
function TimelineNode({
    billboardRef,
    cardRef,
    count,
    entry,
    highlighted,
    index,
    onCardPointerOut,
    onCardPointerOver,
    onCardSelect,
    watched,
}: TimelineNodeProps) {
    const position = timelineNodePosition(index, count);

    return (
        <group position={[position.x, position.y, position.z]}>
            <TimelinePosterCard
                billboardRef={billboardRef}
                cardRef={cardRef}
                entry={entry}
                highlighted={highlighted}
                onPointerOut={onCardPointerOut}
                onPointerOver={onCardPointerOver}
                onSelect={onCardSelect}
                watched={watched}
            />
        </group>
    );
}

interface TimelineCardRegistration {
    billboardRef: RefCallback<Group>;
    cardRef: RefCallback<Group>;
    worldPosition: Vector3;
}

interface TimelineCardsProps {
    entries: readonly TimelineEntry[];
    focusIndex: number;
    onSelect: (slug: string) => void;
    reducedMotion: boolean;
    selectedSlug?: string;
    watchedSlugs: readonly string[];
}

function getTimelineCardRenderOrder(cardDepth: number, anchorDepth: number, selected: boolean) {
    // Let the stream and its particles cover cards when their anchor is closer to the camera.
    const energyOrderOffset = anchorDepth > cardDepth ? -3000 : 0;
    return (
        energyOrderOffset +
        (selected ? SELECTED_CARD_RENDER_ORDER : CARD_RENDER_ORDER_BASE + cardDepth)
    );
}

function TimelineCards({
    entries,
    focusIndex,
    onSelect,
    reducedMotion,
    selectedSlug,
    watchedSlugs,
}: TimelineCardsProps) {
    const [hoveredSlug, setHoveredSlug] = useState<string>();
    const billboardRefs = useRef<Array<Group | null>>([]);
    const cardRefs = useRef<Array<Group | null>>([]);
    const anchorViewPosition = useMemo(() => new Vector3(), []);
    const connectionRef = useRef<InstancedMesh>(null);
    const connectionMaterial = useMemo(CONNECTOR_EFFECT.card.createMaterial, []);
    useEffect(() => () => connectionMaterial.dispose(), [connectionMaterial]);
    const connection = useMemo(
        () => ({
            direction: new Vector3(),
            end: new Vector3(),
            matrix: new Matrix4(),
            midpoint: new Vector3(),
            quaternion: new Quaternion(),
            scale: new Vector3(1, 1, 1),
            start: new Vector3(),
            up: new Vector3(0, 1, 0),
        }),
        []
    );
    const watchedSlugSet = useMemo(() => new Set(watchedSlugs), [watchedSlugs]);
    useCursor(Boolean(hoveredSlug));
    const registrations = useMemo<TimelineCardRegistration[]>(
        () =>
            Array.from({ length: entries.length }, (_, index) => ({
                billboardRef: (group) => {
                    billboardRefs.current[index] = group;
                },
                cardRef: (group) => {
                    cardRefs.current[index] = group;
                },
                worldPosition: new Vector3(),
            })),
        [entries.length]
    );
    const handleSelect = useCallback(
        (event: ThreeEvent<MouseEvent>) => {
            const slug = event.object.userData.timelineSlug;
            if (typeof slug !== "string") {
                return;
            }
            event.stopPropagation();
            onSelect(slug);
        },
        [onSelect]
    );
    const handlePointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
        const slug = event.object.userData.timelineSlug;
        if (typeof slug !== "string") {
            return;
        }
        event.stopPropagation();
        setHoveredSlug(slug);
    }, []);
    const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
        const slug = event.object.userData.timelineSlug;
        if (typeof slug !== "string") {
            return;
        }
        event.stopPropagation();
        setHoveredSlug((current) => (current === slug ? undefined : current));
    }, []);

    useLayoutEffect(() => {
        const mesh = connectionRef.current as InstancedMesh;
        const colour = new Color();
        entries.forEach((entry, index) => {
            mesh.setColorAt(index, colour.set(getTimelineNodeAccent(entry)));
        });
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [entries]);

    const updateConnection = useCallback(
        (billboard: Group, card: Group, index: number) => {
            const mesh = connectionRef.current as InstancedMesh;
            if (!billboard.parent) {
                return;
            }
            billboard.parent.getWorldPosition(connection.start);
            connection.start.y += NODE_LIFT;
            // Transform the actual card bottom, including its billboard rotation and focus scale.
            connection.end.set(0, CARD_GAP_FROM_ORB - billboard.position.y, 0);
            card.localToWorld(connection.end);
            connection.direction.subVectors(connection.end, connection.start);
            connection.scale.y = connection.direction.length();
            connection.quaternion.setFromUnitVectors(
                connection.up,
                connection.direction.normalize()
            );
            connection.midpoint.addVectors(connection.start, connection.end).multiplyScalar(0.5);
            connection.matrix.compose(connection.midpoint, connection.quaternion, connection.scale);
            mesh.setMatrixAt(index, connection.matrix);
        },
        [connection]
    );

    useFrame(({ camera, clock, invalidate }, delta) => {
        connectionMaterial.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
        connectionMaterial.uniforms.uMotion.value = reducedMotion ? 0 : 1;
        let animationMoving = false;
        entries.forEach((entry, index) => {
            const billboard = billboardRefs.current[index];
            const card = cardRefs.current[index];
            if (!(billboard && card)) {
                return;
            }
            billboard.quaternion.copy(camera.quaternion);
            const selected = selectedSlug === entry.slug;
            const highlighted = selected || focusIndex === index || hoveredSlug === entry.slug;
            let targetScale = 1;
            if (selected) {
                targetScale = 1.055;
            } else if (highlighted) {
                targetScale = 1.025;
            }
            const targetOffsetY = highlighted ? 0.035 : 0;
            const nextScale = MathUtils.damp(card.scale.x, targetScale, 14, delta);
            const nextOffsetY = MathUtils.damp(card.position.y, targetOffsetY, 14, delta);
            card.scale.setScalar(nextScale);
            card.position.y = nextOffsetY;
            card.getWorldPosition(registrations[index].worldPosition);
            registrations[index].worldPosition.applyMatrix4(camera.matrixWorldInverse);
            billboard.parent?.getWorldPosition(anchorViewPosition);
            anchorViewPosition.applyMatrix4(camera.matrixWorldInverse);
            card.renderOrder = getTimelineCardRenderOrder(
                registrations[index].worldPosition.z,
                anchorViewPosition.z,
                selected
            );
            updateConnection(billboard, card, index);
            animationMoving ||=
                Math.abs(nextScale - targetScale) > 0.001 ||
                Math.abs(nextOffsetY - targetOffsetY) > 0.001;
        });
        (connectionRef.current as InstancedMesh).instanceMatrix.needsUpdate = true;
        if (animationMoving) {
            invalidate();
        }
    });

    return (
        <>
            <instancedMesh
                args={[CONNECTOR_EFFECT.card.geometry, connectionMaterial, entries.length]}
                frustumCulled={false}
                ref={connectionRef}
                renderOrder={3}
            />
            {entries.map((entry, index) => {
                const selected = selectedSlug === entry.slug;
                const highlighted = selected || focusIndex === index || hoveredSlug === entry.slug;
                return (
                    <TimelineNode
                        billboardRef={registrations[index].billboardRef}
                        cardRef={registrations[index].cardRef}
                        count={entries.length}
                        entry={entry}
                        highlighted={highlighted}
                        index={index}
                        key={entry.slug}
                        onCardPointerOut={handlePointerOut}
                        onCardPointerOver={handlePointerOver}
                        onCardSelect={handleSelect}
                        watched={watchedSlugSet.has(entry.slug)}
                    />
                );
            })}
        </>
    );
}

interface TargetableControls {
    target: Vector3;
    update: () => void;
}

function isTargetableControls(controls: unknown): controls is TargetableControls {
    return Boolean(
        controls && typeof controls === "object" && "target" in controls && "update" in controls
    );
}

interface MutableNumberRef {
    current: number;
}

interface MutableVectorRef {
    current: Vector3;
}

function updateFocusPosition(
    camera: Camera,
    controls: TargetableControls | null,
    destination: MutableVectorRef,
    delta: number
): boolean {
    if (!Number.isFinite(destination.current.x)) {
        return false;
    }

    if (controls) {
        const previousTarget = controls.target.clone();
        controls.target.x = MathUtils.damp(controls.target.x, destination.current.x, 7, delta);
        controls.target.y = MathUtils.damp(controls.target.y, destination.current.y, 7, delta);
        controls.target.z = MathUtils.damp(controls.target.z, destination.current.z, 7, delta);
        camera.position.add(controls.target.clone().sub(previousTarget));
        if (controls.target.distanceTo(destination.current) < 0.01) {
            destination.current.set(Number.NaN, Number.NaN, Number.NaN);
        }
    } else {
        camera.position.x = MathUtils.damp(camera.position.x, destination.current.x, 7, delta);
        camera.position.y = MathUtils.damp(camera.position.y, destination.current.y, 7, delta);
        camera.position.z = MathUtils.damp(camera.position.z, destination.current.z, 7, delta);
        if (camera.position.distanceTo(destination.current) < 0.01) {
            destination.current.set(Number.NaN, Number.NaN, Number.NaN);
        }
    }

    return Number.isFinite(destination.current.x);
}

function updateZoomDistance({
    appliedDistance,
    camera,
    cameraOffset,
    controls,
    delta,
    onZoomDistanceChange,
    targetDistance,
}: {
    appliedDistance: MutableNumberRef;
    camera: Camera;
    cameraOffset: Vector3;
    controls: TargetableControls;
    delta: number;
    onZoomDistanceChange: (distance: number) => void;
    targetDistance: MutableNumberRef;
}): number {
    const currentDistance = camera.position.distanceTo(controls.target);
    if (!Number.isFinite(appliedDistance.current)) {
        appliedDistance.current = currentDistance;
    } else if (
        Math.abs(currentDistance - appliedDistance.current) > 0.08 &&
        Math.abs(currentDistance - targetDistance.current) > 0.08
    ) {
        const nextDistance = MathUtils.clamp(currentDistance, MIN_ZOOM_DISTANCE, MAX_ZOOM_DISTANCE);
        targetDistance.current = nextDistance;
        onZoomDistanceChange(nextDistance);
    }

    const nextDistance = MathUtils.damp(currentDistance, targetDistance.current, 9, delta);
    if (Math.abs(nextDistance - currentDistance) > 0.001) {
        cameraOffset.copy(camera.position).sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(cameraOffset, nextDistance);
    }
    return nextDistance;
}

interface CameraRigProps {
    focusKey: number;
    focusPosition: Vector3;
    initialPosition: Vector3;
    onZoomDistanceChange: (distance: number) => void;
    sceneKey: string;
    zoomDistance: number;
}

function CameraRig({
    focusKey,
    focusPosition,
    initialPosition,
    onZoomDistanceChange,
    sceneKey,
    zoomDistance,
}: CameraRigProps) {
    const camera = useThree((state) => state.camera);
    const controls = useThree((state) => state.controls);
    const invalidate = useThree((state) => state.invalidate);
    const destination = useRef(new Vector3(Number.NaN, Number.NaN, Number.NaN));
    const targetZoomDistance = useRef(zoomDistance);
    const appliedZoomDistance = useRef(Number.NaN);
    const cameraOffset = useRef(new Vector3());
    const appliedSceneKey = useRef("");

    useEffect(() => {
        destination.current.copy(focusPosition);
        invalidate();
    }, [focusKey, focusPosition, invalidate]);

    useEffect(() => {
        targetZoomDistance.current = zoomDistance;
        invalidate();
    }, [invalidate, zoomDistance]);

    useFrame((_, delta) => {
        const timelineControls = isTargetableControls(controls) ? controls : null;
        if (timelineControls && appliedSceneKey.current !== sceneKey) {
            const resetDistance = MathUtils.clamp(
                targetZoomDistance.current,
                MIN_ZOOM_DISTANCE,
                MAX_ZOOM_DISTANCE
            );
            timelineControls.target.copy(initialPosition);
            camera.position.set(
                initialPosition.x,
                initialPosition.y,
                initialPosition.z + resetDistance
            );
            timelineControls.update();
            appliedZoomDistance.current = resetDistance;
            appliedSceneKey.current = sceneKey;
            destination.current.set(Number.NaN, Number.NaN, Number.NaN);
        }
        if (!(timelineControls || Number.isFinite(destination.current.x))) {
            return;
        }
        const focusMoving = updateFocusPosition(camera, timelineControls, destination, delta);
        if (timelineControls) {
            updateZoomDistance({
                appliedDistance: appliedZoomDistance,
                camera,
                cameraOffset: cameraOffset.current,
                controls: timelineControls,
                delta,
                onZoomDistanceChange,
                targetDistance: targetZoomDistance,
            });
            timelineControls.update();
            appliedZoomDistance.current = camera.position.distanceTo(timelineControls.target);
        }

        const zoomMoving =
            timelineControls &&
            Math.abs(
                camera.position.distanceTo(timelineControls.target) - targetZoomDistance.current
            ) > 0.01;
        if (focusMoving || zoomMoving) {
            invalidate();
        }
    });

    return null;
}

function createTimelineCurve(points: readonly Vector3[]): Curve<Vector3> {
    const first = points[0] ?? new Vector3(-2, 0, 0);
    const last = points.at(-1) ?? new Vector3(2, 0, 0);
    if (points.length < 3) {
        return new LineCurve3(
            first,
            last.equals(first) ? first.clone().add(new Vector3(0.001, 0, 0)) : last
        );
    }
    return new CatmullRomCurve3([...points], false, "catmullrom", 0.42);
}

interface TimelineSceneProps {
    compact: boolean;
    entries: readonly TimelineEntry[];
    focusIndex: number;
    focusKey: number;
    focusPosition: Vector3;
    onSelect: (slug: string) => void;
    onZoomDistanceChange: (distance: number) => void;
    qualityFactor: number;
    reducedMotion: boolean;
    sceneKey: string;
    selectedSlug?: string;
    watchedSlugs: readonly string[];
    zoomDistance: number;
}

function TimelineScene({
    compact,
    entries,
    focusIndex,
    focusKey,
    focusPosition,
    onSelect,
    qualityFactor,
    reducedMotion,
    selectedSlug,
    watchedSlugs,
    onZoomDistanceChange,
    zoomDistance,
    sceneKey,
}: TimelineSceneProps) {
    const points = useMemo(
        () =>
            entries.map((_, index) => {
                const position = timelineNodePosition(index, entries.length);
                return new Vector3(position.x, position.y, position.z);
            }),
        [entries]
    );
    const curve = useMemo(() => createTimelineCurve(points), [points]);
    return (
        <>
            <color args={["#000000"]} attach="background" />
            <fog args={["#000000", 12, 35]} attach="fog" />
            <ambientLight intensity={0.45} />
            <pointLight color="#ff782d" intensity={28} position={[0, 4, 6]} />
            <pointLight color="#444cff" intensity={8} position={[0, -5, -3]} />
            {/* Group ordering keeps the background behind cards on either side of the stream. */}
            <group renderOrder={-10_000}>
                <CosmicBackground nodes={points} reducedMotion={reducedMotion} />
            </group>
            <TimelineEnergy
                compact={compact}
                curve={curve}
                eventCount={entries.length}
                qualityFactor={qualityFactor}
                reducedMotion={reducedMotion}
            />
            <InstancedTimelineNodes
                count={entries.length}
                curve={curve}
                entries={entries}
                onSelect={onSelect}
                reducedMotion={reducedMotion}
                selectedSlug={selectedSlug ?? entries[focusIndex]?.slug}
            />
            <TimelineCards
                entries={entries}
                focusIndex={focusIndex}
                onSelect={onSelect}
                reducedMotion={reducedMotion}
                selectedSlug={selectedSlug}
                watchedSlugs={watchedSlugs}
            />
            <OrbitControls
                dampingFactor={0.075}
                enableDamping
                enablePan={false}
                enableRotate
                enableZoom
                makeDefault
                maxDistance={MAX_ZOOM_DISTANCE}
                minDistance={MIN_ZOOM_DISTANCE}
                zoomSpeed={0.7}
            />
            <CameraRig
                focusKey={focusKey}
                focusPosition={focusPosition}
                initialPosition={focusPosition}
                onZoomDistanceChange={onZoomDistanceChange}
                sceneKey={sceneKey}
                zoomDistance={zoomDistance}
            />
        </>
    );
}

function DemandFrameLoop() {
    const invalidate = useThree((state) => state.invalidate);

    useEffect(() => {
        // Adapt rendering cost without permanently throttling animation or resetting its clock.
        let animationFrame = 0;
        const requestFrame = () => {
            invalidate();
            animationFrame = window.requestAnimationFrame(requestFrame);
        };
        animationFrame = window.requestAnimationFrame(requestFrame);
        return () => window.cancelAnimationFrame(animationFrame);
    }, [invalidate]);

    return null;
}

function supportsWebGl(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
}

export function TimelineOrbit({
    entries,
    focusIndex,
    focusKey,
    onSelect,
    selectedSlug,
    watchedSlugs,
}: TimelineOrbitProps) {
    const [webGlSupported, setWebGlSupported] = useState<boolean | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [compact, setCompact] = useState(false);
    const [qualityFactor, setQualityFactor] = useState(1);
    const [zoomDistance, setZoomDistance] = useState(DEFAULT_ZOOM_DISTANCE);
    const [zoomStorageReady, setZoomStorageReady] = useState(false);
    const cameraSettings = useMemo(
        () => ({ fov: 43, position: [0, 0, 10.5] as [number, number, number] }),
        []
    );
    const sceneKey = useMemo(() => entries.map((entry) => entry.slug).join("|"), [entries]);
    const safeFocusIndex = Math.min(Math.max(focusIndex, 0), Math.max(entries.length - 1, 0));
    const focusPosition = useMemo(() => {
        const nodePosition = timelineNodePosition(safeFocusIndex, entries.length);
        return new Vector3(
            nodePosition.x,
            nodePosition.y + TIMELINE_CARD_FOCUS_OFFSET_Y,
            nodePosition.z
        );
    }, [entries.length, safeFocusIndex]);
    const handleZoomDistanceChange = useCallback((nextDistance: number) => {
        const roundedDistance = Math.round(nextDistance * 10) / 10;
        setZoomDistance((current) =>
            Math.abs(current - roundedDistance) < 0.05 ? current : roundedDistance
        );
    }, []);
    const handlePerformanceChange = useCallback(({ factor }: { factor: number }) => {
        const nextFactor = Math.round(factor * 4) / 4;
        setQualityFactor((current) => (current === nextFactor ? current : nextFactor));
    }, []);

    useEffect(() => {
        try {
            const storedValue = window.localStorage.getItem(ZOOM_STORAGE_KEY);
            if (storedValue !== null) {
                const storedZoomDistance = Number(storedValue);
                if (Number.isFinite(storedZoomDistance)) {
                    setZoomDistance(
                        MathUtils.clamp(storedZoomDistance, MIN_ZOOM_DISTANCE, MAX_ZOOM_DISTANCE)
                    );
                }
            }
        } catch {
            // Storage can be unavailable in private browsing contexts.
        }
        setZoomStorageReady(true);
    }, []);

    useEffect(() => {
        if (!zoomStorageReady) {
            return;
        }
        try {
            window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomDistance));
        } catch {
            // Storage can be unavailable in private browsing contexts.
        }
    }, [zoomDistance, zoomStorageReady]);

    useEffect(() => {
        setWebGlSupported(supportsWebGl());
        setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        const compactMediaQuery = window.matchMedia("(max-width: 720px)");
        const updateCompactMode = () => {
            setCompact(compactMediaQuery.matches || navigator.hardwareConcurrency <= 4);
        };
        updateCompactMode();
        compactMediaQuery.addEventListener("change", updateCompactMode);
        return () => compactMediaQuery.removeEventListener("change", updateCompactMode);
    }, []);

    if (webGlSupported === null) {
        return (
            <div className="grid h-full place-items-center bg-black">
                <p className="font-mono text-[0.7rem] text-white/35 uppercase tracking-[0.2em]">
                    Calibrating temporal coordinates
                </p>
            </div>
        );
    }

    if (!webGlSupported) {
        return (
            <div className="grid h-full place-items-center bg-black p-8 text-center">
                <div className="max-w-md">
                    <p className="font-mono text-gold text-xs uppercase tracking-[0.2em]">
                        3D unavailable
                    </p>
                    <h2 className="mt-4 font-semibold text-3xl tracking-[-0.04em]">
                        This device cannot open the temporal archive.
                    </h2>
                    <p className="mt-4 text-white/48 leading-7">
                        Try a browser with WebGL enabled to explore the interactive timeline.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            <Canvas
                camera={cameraSettings}
                dpr={[1, 1.25 + qualityFactor * 0.75]}
                frameloop="demand"
                gl={{ alpha: false, powerPreference: "high-performance", stencil: false }}
            >
                <Suspense fallback={null}>
                    <PerformanceMonitor factor={1} onChange={handlePerformanceChange} step={0.25}>
                        <TimelineScene
                            compact={compact}
                            entries={entries}
                            focusIndex={safeFocusIndex}
                            focusKey={focusKey}
                            focusPosition={focusPosition}
                            onSelect={onSelect}
                            onZoomDistanceChange={handleZoomDistanceChange}
                            qualityFactor={qualityFactor}
                            reducedMotion={reducedMotion}
                            sceneKey={sceneKey}
                            selectedSlug={selectedSlug}
                            watchedSlugs={watchedSlugs}
                            zoomDistance={zoomDistance}
                        />
                        {reducedMotion ? null : <DemandFrameLoop />}
                    </PerformanceMonitor>
                </Suspense>
            </Canvas>
        </div>
    );
}
