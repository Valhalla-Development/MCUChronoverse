"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Vector2, Vector3 } from "three";

let pageSeed: number | undefined;

function getPageSeed() {
    // Keep the seed for this document, including scene remounts. A full page
    // refresh starts a new slice; filters and adaptive quality never reshuffle it.
    pageSeed ??= crypto.getRandomValues(new Uint32Array(1))[0];
    return pageSeed;
}

function seededRandom(initialSeed: number) {
    let seed = initialSeed;
    return () => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return seed / 4_294_967_296;
    };
}

const vertexShader = /* glsl */ `
    attribute vec4 aStyle;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform vec2 uViewportSize;
    uniform float uVolume;
    uniform float uDust;
    uniform vec3 uNodes[6];
    varying float vAlpha;
    varying float vDetail;
    varying float vWarmth;
    varying float vGlint;
    void main() {
        // Wrap a world-space volume around the camera. Different distances give
        // real parallax during navigation without attaching stars to the lens.
        vec3 drift = vec3(0.014, 0.006, -0.003) * uTime * (0.4 + aStyle.z);
        vec3 relative = mod(position + drift - cameraPosition + uVolume * 0.5, uVolume)
            - uVolume * 0.5;
        vec3 world = relative + cameraPosition;
        vec4 view = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        vAlpha = 0.0;
        vDetail = 0.0;
        vWarmth = 0.0;
        vGlint = step(0.97, aStyle.z) * (1.0 - uDust);
        float perspective = clamp(42.0 / max(1.0, -view.z), 0.65, 1.8);
        float size = aStyle.x * perspective;
        // Nearby dust stays pin-sized instead of growing into foreground blobs.
        size = mix(size, min(size, 3.0), uDust);
        gl_PointSize = size * uPixelRatio * mix(1.0, 4.5, vGlint);
        // Include the entire sprite in the clip margin so large glints at screen edges remain.
        vec2 clipMargin = gl_PointSize / uViewportSize * gl_Position.w;
        if (gl_Position.w <= 0.0 || abs(gl_Position.z) > gl_Position.w
            || any(greaterThan(abs(gl_Position.xy), vec2(gl_Position.w) + clipMargin))) {
            return;
        }
        float distanceToCamera = length(relative);
        float edgeFade = 1.0 - smoothstep(uVolume * 0.34, uVolume * 0.49, distanceToCamera);
        float nearFade = smoothstep(3.0, 8.0, distanceToCamera);
        if (edgeFade * nearFade == 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
        // Thin only tiny, distant grains. Stable per-particle seeds prevent flicker while
        // the retained points gain a little opacity so the background keeps its depth.
        float farKeep = mix(1.0, mix(0.72, 0.52, uDust),
            smoothstep(36.0, 68.0, distanceToCamera));
        float lodSeed = fract(aStyle.w / 6.283185);
        if (vGlint < 0.5 && lodSeed > farKeep) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
        float illumination = 0.0;
        // Only dust uses node illumination; stars retain their own palette and brightness.
        if (uDust > 0.5) {
            for (int i = 0; i < 6; i++) {
                vec3 offset = world - uNodes[i];
                float distanceSquared = dot(offset, offset);
                if (distanceSquared < 45.0) {
                    illumination = max(illumination, exp(-distanceSquared / 5.0));
                }
            }
        }
        // Only a small minority shimmer, with a soft crest about once a minute.
        float shimmer = 0.0;
        if (uDust < 0.5 && aStyle.z >= 0.975) {
            shimmer = pow(max(0.0, sin(uTime * 0.105 + aStyle.w)), 48.0) * 0.12;
        }
        float palette = fract(aStyle.w * 7.13);
        vWarmth = mix(palette, 0.3 + palette * 0.65 + illumination * 0.05, uDust);
        vDetail = max(vGlint, step(1.8, size));
        vAlpha = (aStyle.y + shimmer) * edgeFade * nearFade * inversesqrt(farKeep);
        vAlpha *= mix(1.0, 0.85 + illumination * 1.5, uDust);
    }
`;

const fragmentShader = /* glsl */ `
    uniform float uDust;
    varying float vAlpha;
    varying float vDetail;
    varying float vWarmth;
    varying float vGlint;
    void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float radiusSquared = dot(p, p);
        float radius = 0.0;
        // The original edge function is exactly zero outside the sprite's circle.
        if (radiusSquared >= 1.0 || vAlpha == 0.0) discard;
        float core;
        float edge;
        if (vDetail < 0.5) {
            // Sub-two-pixel points cannot show the full radial profile. A cubic falloff
            // preserves their apparent size without evaluating exponentials or a square root.
            float falloff = 1.0 - radiusSquared;
            core = falloff * falloff * falloff;
            edge = 1.0;
        } else {
            radius = sqrt(radiusSquared);
            core = exp(-radiusSquared * mix(3.5, 45.0, vGlint));
            edge = 1.0 - smoothstep(0.65, 1.0, radius);
        }
        if (vGlint > 0.5) {
            float halo = exp(-radius * radius * 12.0) * 0.12;
            float rays = (exp(-abs(p.x) * 95.0 - abs(p.y) * 5.0)
                + exp(-abs(p.y) * 95.0 - abs(p.x) * 5.0)) * 0.23;
            core += vGlint * (halo + rays);
        }
        // Distinct ivory, gold, amber and copper populations keep the warm
        // colour visible in tiny points instead of diluting every hue with white.
        vec3 colour = mix(vec3(0.82, 0.69, 0.48), vec3(0.92, 0.36, 0.035),
            smoothstep(0.12, 0.62, vWarmth));
        colour = mix(colour, vec3(0.78, 0.115, 0.012), smoothstep(0.62, 0.98, vWarmth));
        gl_FragColor = vec4(colour, core * edge * vAlpha);
        #include <colorspace_fragment>
    }
`;

const cloudVertexShader = /* glsl */ `
    attribute vec3 aCentre;
    attribute vec3 aCloudStyle;
    uniform float uTime;
    uniform float uVolume;
    varying vec2 vUv;
    varying float vDetail;
    varying float vFade;
    varying float vSeed;
    void main() {
        vec3 drift = vec3(0.014, 0.006, -0.003) * uTime * 0.9;
        vec3 relative = mod(aCentre + drift - cameraPosition + uVolume * 0.5, uVolume)
            - uVolume * 0.5;
        float distanceToCamera = length(relative);
        vFade = smoothstep(10.0, 19.0, distanceToCamera)
            * (1.0 - smoothstep(uVolume * 0.34, uVolume * 0.48, distanceToCamera));
        vDetail = 1.0 - smoothstep(28.0, 58.0, distanceToCamera);
        vUv = uv;
        vSeed = aCloudStyle.z * 13.0;
        // Fully faded panels can otherwise cover the screen with invisible procedural noise.
        // All vertices share the centre and fade, so the entire instance is rejected together.
        if (vFade == 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
        vec4 view = viewMatrix * vec4(relative + cameraPosition, 1.0);
        float angle = aCloudStyle.z;
        vec2 local = position.xy * aCloudStyle.xy;
        view.xy += mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * local;
        gl_Position = projectionMatrix * view;
    }
`;

const cloudFragmentShader = /* glsl */ `
    uniform float uWarmth;
    uniform float uCloudOpacity;
    uniform float uPalette;
    varying vec2 vUv;
    varying float vDetail;
    varying float vFade;
    varying float vSeed;
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 blend = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), blend.x),
            mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), blend.x), blend.y);
    }
    float smoke(vec2 p) {
        // Preserve the average density as distant clouds drop their fine noise octaves.
        float value = noise(p) * 0.57 + 0.215;
        if (vDetail > 0.2) {
            value += (noise(p * 2.13 + 7.1) - 0.5) * 0.28;
        }
        if (vDetail > 0.65) {
            value += (noise(p * 4.37 + 19.4) - 0.5) * 0.15;
        }
        return value;
    }
    void main() {
        vec2 p = vUv * 2.0 - 1.0;
        vec2 seed = vec2(vSeed, vSeed * 0.37);
        vec2 warp = vec2(smoke(p * 1.8 + seed), smoke(p * 2.1 + seed + 31.0));
        float edge = 1.0 - smoothstep(0.25, 0.98, length(p + (warp - 0.5) * 0.34));
        if (edge == 0.0) discard;
        float density = smoke(p * 3.15 + warp * 2.45 + seed);
        float bodyDensity = smoothstep(0.24, 0.69, density);
        if (bodyDensity == 0.0) discard;
        // Eroded holes and a soft boundary produce isolated smoke, never a
        // rectangular overlay or a continuous bright band across the scene.
        float holes = smoothstep(0.3, 0.66, smoke(p * 2.55 + seed + 83.0));
        float body = edge * holes * bodyDensity;
        float alpha = body * vFade * mix(0.15, 0.23, density);
        // Colour noise cannot contribute where the existing cloud shape is fully transparent.
        if (alpha == 0.0) discard;

        vec3 shadowColour;
        vec3 bodyColour;
        vec3 accentColour;
        vec3 highlightColour;
        if (uPalette < 0.5) {
            shadowColour = vec3(0.075, 0.025, 0.24);
            bodyColour = vec3(0.42, 0.075, 0.68);
            accentColour = vec3(0.025, 0.42, 0.58);
            highlightColour = vec3(0.72, 0.19, 0.075);
        } else if (uPalette < 1.5) {
            shadowColour = vec3(0.24, 0.018, 0.075);
            bodyColour = vec3(0.68, 0.055, 0.23);
            accentColour = vec3(0.035, 0.3, 0.68);
            highlightColour = vec3(0.72, 0.3, 0.018);
        } else {
            shadowColour = vec3(0.012, 0.15, 0.18);
            bodyColour = vec3(0.025, 0.46, 0.32);
            accentColour = vec3(0.25, 0.075, 0.62);
            highlightColour = vec3(0.68, 0.3, 0.018);
        }

        float colourRegion = smoke(p * 1.28 + seed + 41.0 + uWarmth * 4.0);
        float accentMask = smoothstep(0.39, 0.68, colourRegion);
        float highlightRegion = smoke(p * 2.7 - seed * 0.4 + 117.0);
        float highlightMask = smoothstep(0.59, 0.78, highlightRegion)
            * smoothstep(0.38, 0.72, density);
        vec3 colour = mix(shadowColour, bodyColour, smoothstep(0.28, 0.76, density));
        colour = mix(colour, accentColour, accentMask * 0.78);
        colour = mix(colour, highlightColour, highlightMask * 0.66);
        colour += mix(accentColour, highlightColour, highlightMask)
            * smoothstep(0.64, 0.83, density) * 0.1;
        gl_FragColor = vec4(colour, alpha * uCloudOpacity);
        #include <colorspace_fragment>
    }
`;

function createField(count: number, volume: number, dust: boolean, loadSeed: number) {
    const positions = new Float32Array(count * 3);
    const styles = new Float32Array(count * 4);
    // A full refresh generates a new field while all scene remounts retain it.
    const random = seededRandom((loadSeed + (dust ? 8191 : 137) * 1_000_003) % 4_294_967_296);
    const variation = seededRandom((loadSeed + (dust ? 8191 : 137)) % 4_294_967_296);
    const density = 0.92 + variation() * 0.08;
    const warmth = variation();
    const palette = Math.floor(variation() * 3);
    const gaussian = () =>
        Math.sqrt(-2 * Math.log(Math.max(random(), 0.0001))) * Math.cos(random() * Math.PI * 2);
    // Separate, crooked filaments occupy a small fraction of the volume. Their
    // varying width and gaps avoid the solid noise bands of a projected texture.
    const filaments = Array.from({ length: 128 }, () => {
        const direction = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
        const sideways = new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize();
        return {
            bend: (1 + random() * 3) * (0.82 + variation() * 0.36),
            centre: new Vector3(
                (random() - 0.5) * volume + (variation() - 0.5) * 7.0,
                (random() - 0.5) * volume + (variation() - 0.5) * 7.0,
                (random() - 0.5) * volume + (variation() - 0.5) * 7.0
            ),
            direction,
            length: (6 + random() * 17) * (0.95 + variation() * 0.1),
            normal: new Vector3().crossVectors(direction, sideways),
            phase: random() * Math.PI * 2 + (variation() - 0.5) * 0.45,
            sideways,
            width: (0.3 + random() * 1.1) * (0.82 + variation() * 0.36),
        };
    });
    const point = new Vector3();
    for (let index = 0; index < count; index += 1) {
        if (dust && random() > 0.18) {
            const filament = filaments[Math.floor(random() * filaments.length)];
            const t = (random() - 0.5) * 2;
            const width = filament.width * (0.3 + Math.sin(t * 7 + filament.phase) ** 2);
            point
                .copy(filament.centre)
                .addScaledVector(filament.direction, t * filament.length)
                .addScaledVector(
                    filament.sideways,
                    Math.sin(t * 3 + filament.phase) * filament.bend + gaussian() * width
                )
                .addScaledVector(filament.normal, gaussian() * width * 0.55);
        } else {
            point.set(
                (random() - 0.5) * volume,
                (random() - 0.5) * volume,
                (random() - 0.5) * volume
            );
        }
        const jitter = dust ? 0.35 : 5.2;
        point.x += (variation() - 0.5) * jitter;
        point.y += (variation() - 0.5) * jitter;
        point.z += (variation() - 0.5) * jitter;
        positions.set([point.x, point.y, point.z], index * 3);
        const depth = random();
        styles.set(
            [
                (dust ? 2 + random() ** 3 : 2.4 + depth ** 5 * 4.2) * (0.94 + variation() * 0.1),
                (dust ? 0.3 + random() ** 3 * 0.45 : 0.3 + depth ** 3 * 0.7) *
                    (0.92 + variation() * 0.12),
                depth,
                random() * Math.PI * 2,
            ],
            index * 4
        );
    }
    // Only a subset of the existing particle filaments carries diffuse smoke.
    // Reusing their centres puts tiny grains inside the clouds without adding stars.
    const cloudCentres: number[] = [];
    const cloudStyles: number[] = [];
    if (dust) {
        for (let index = 0; index < filaments.length; index += 2) {
            const filament = filaments[index];
            for (const t of [-0.58, 0.08, 0.62]) {
                point
                    .copy(filament.centre)
                    .addScaledVector(filament.direction, t * filament.length)
                    .addScaledVector(
                        filament.sideways,
                        Math.sin(t * 3 + filament.phase) * filament.bend
                    );
                cloudCentres.push(point.x, point.y, point.z);
                cloudStyles.push(15 + filament.width * 11, 9 + filament.width * 7, filament.phase);
            }
        }
    }
    return {
        cloudCentres: new Float32Array(cloudCentres),
        cloudStyles: new Float32Array(cloudStyles),
        density,
        palette,
        positions,
        styles,
        warmth,
    };
}

function CosmicLayer({
    compact,
    dust,
    loadSeed,
    nodes,
    reducedMotion,
}: {
    compact: boolean;
    dust: boolean;
    loadSeed: number;
    nodes: readonly Vector3[];
    reducedMotion: boolean;
}) {
    const volume = 160;
    const maximumCount = dust ? 320_000 : 64_000;
    const field = useMemo(
        () => createField(maximumCount, volume, dust, loadSeed),
        [dust, loadSeed]
    );
    const uniforms = useMemo(
        () => ({
            uCloudOpacity: { value: field.density },
            uDust: { value: dust ? 1 : 0 },
            uNodes: { value: Array.from({ length: 6 }, () => new Vector3(1e6, 1e6, 1e6)) },
            uPalette: { value: field.palette },
            uPixelRatio: { value: 1 },
            uTime: { value: 0 },
            uViewportSize: { value: new Vector2(1, 1) },
            uVolume: { value: volume },
            uWarmth: { value: field.warmth },
        }),
        [dust, field]
    );
    // Use a fixed device budget from the first frame. The scene performance
    // monitor may adjust other effects, but cannot remove background particles.
    const count = Math.round(maximumCount * field.density * (compact ? 0.65 : 0.85));

    useFrame(({ camera, gl }, delta) => {
        if (!reducedMotion) {
            // Clamp resume deltas so returning to a hidden tab never jumps the field.
            uniforms.uTime.value += Math.min(delta, 0.05);
        }
        uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
        gl.getDrawingBufferSize(uniforms.uViewportSize.value);
        if (!dust) {
            return;
        }
        let closest = 0;
        let distance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < nodes.length; index += 1) {
            const nextDistance = nodes[index].distanceToSquared(camera.position);
            if (nextDistance < distance) {
                closest = index;
                distance = nextDistance;
            }
        }
        const first = Math.max(0, Math.min(closest - 2, nodes.length - 6));
        for (let index = 0; index < 6; index += 1) {
            const node = nodes[first + index];
            if (node) {
                uniforms.uNodes.value[index].copy(node);
            } else {
                uniforms.uNodes.value[index].set(1e6, 1e6, 1e6);
            }
        }
    });

    return (
        <>
            {dust && (
                <mesh frustumCulled={false} renderOrder={-20}>
                    <instancedBufferGeometry instanceCount={field.cloudCentres.length / 3}>
                        <bufferAttribute
                            args={[
                                new Float32Array([
                                    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
                                ]),
                                3,
                            ]}
                            attach="attributes-position"
                        />
                        <bufferAttribute
                            args={[new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2]}
                            attach="attributes-uv"
                        />
                        <bufferAttribute
                            args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]}
                            attach="index"
                        />
                        <instancedBufferAttribute
                            args={[field.cloudCentres, 3]}
                            attach="attributes-aCentre"
                        />
                        <instancedBufferAttribute
                            args={[field.cloudStyles, 3]}
                            attach="attributes-aCloudStyle"
                        />
                    </instancedBufferGeometry>
                    <shaderMaterial
                        depthWrite={false}
                        fragmentShader={cloudFragmentShader}
                        toneMapped={false}
                        transparent
                        uniforms={uniforms}
                        vertexShader={cloudVertexShader}
                    />
                </mesh>
            )}
            <points frustumCulled={false} renderOrder={-10}>
                <bufferGeometry drawRange={{ count, start: 0 }}>
                    <bufferAttribute args={[field.positions, 3]} attach="attributes-position" />
                    <bufferAttribute args={[field.styles, 4]} attach="attributes-aStyle" />
                </bufferGeometry>
                <shaderMaterial
                    depthWrite={false}
                    fragmentShader={fragmentShader}
                    toneMapped={false}
                    transparent
                    uniforms={uniforms}
                    vertexShader={vertexShader}
                />
            </points>
        </>
    );
}

export function CosmicBackground(props: { nodes: readonly Vector3[]; reducedMotion: boolean }) {
    const [configuration, setConfiguration] = useState<{
        compact: boolean;
        loadSeed: number;
    } | null>(null);
    useEffect(() => {
        // Resolve device size before revealing the field. Later resizes, filters,
        // or quality samples must not change its established particle population.
        setConfiguration({
            compact:
                window.matchMedia("(max-width: 720px)").matches ||
                navigator.hardwareConcurrency <= 4,
            loadSeed: getPageSeed(),
        });
    }, []);
    if (configuration === null) {
        return null;
    }
    return (
        <>
            <CosmicLayer {...props} {...configuration} dust={false} />
            <CosmicLayer {...props} {...configuration} dust />
        </>
    );
}
