"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Vector3 } from "three";

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
    uniform float uVolume;
    uniform float uDust;
    uniform vec3 uNodes[6];
    varying float vAlpha;
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
        float distanceToCamera = length(relative);
        float edgeFade = 1.0 - smoothstep(uVolume * 0.34, uVolume * 0.49, distanceToCamera);
        float nearFade = smoothstep(3.0, 8.0, distanceToCamera);
        float illumination = 0.0;
        for (int i = 0; i < 6; i++) {
            vec3 offset = world - uNodes[i];
            illumination = max(illumination, exp(-dot(offset, offset) / 5.0));
        }
        // Only a small minority shimmer, with a soft crest about once a minute.
        float shimmer = pow(max(0.0, sin(uTime * 0.105 + aStyle.w)), 48.0)
            * step(0.975, aStyle.z) * 0.12 * (1.0 - uDust);
        float palette = fract(aStyle.w * 7.13);
        vWarmth = mix(palette, 0.3 + palette * 0.65 + illumination * 0.05, uDust);
        vGlint = step(0.97, aStyle.z) * (1.0 - uDust);
        vAlpha = (aStyle.y + shimmer) * edgeFade * nearFade;
        vAlpha *= mix(1.0, 0.85 + illumination * 1.5, uDust);
        float perspective = clamp(42.0 / max(1.0, -view.z), 0.65, 1.8);
        float size = aStyle.x * perspective;
        // Nearby dust stays pin-sized instead of growing into foreground blobs.
        size = mix(size, min(size, 3.0), uDust);
        gl_PointSize = size * uPixelRatio * mix(1.0, 4.5, vGlint);
        gl_Position = projectionMatrix * view;
    }
`;

const fragmentShader = /* glsl */ `
    uniform float uDust;
    varying float vAlpha;
    varying float vWarmth;
    varying float vGlint;
    void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float radius = length(p);
        float core = exp(-radius * radius * mix(3.5, 45.0, vGlint));
        float halo = exp(-radius * radius * 12.0) * 0.12;
        float rays = (exp(-abs(p.x) * 95.0 - abs(p.y) * 5.0)
            + exp(-abs(p.y) * 95.0 - abs(p.x) * 5.0)) * 0.23;
        core += vGlint * (halo + rays);
        float edge = 1.0 - smoothstep(0.65, 1.0, radius);
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
    varying float vFade;
    varying float vSeed;
    void main() {
        vec3 drift = vec3(0.014, 0.006, -0.003) * uTime * 0.9;
        vec3 relative = mod(aCentre + drift - cameraPosition + uVolume * 0.5, uVolume)
            - uVolume * 0.5;
        float distanceToCamera = length(relative);
        vFade = smoothstep(16.0, 30.0, distanceToCamera)
            * (1.0 - smoothstep(uVolume * 0.31, uVolume * 0.46, distanceToCamera));
        vec4 view = viewMatrix * vec4(relative + cameraPosition, 1.0);
        float angle = aCloudStyle.z;
        vec2 local = position.xy * aCloudStyle.xy;
        view.xy += mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * local;
        gl_Position = projectionMatrix * view;
        vUv = uv;
        vSeed = angle * 13.0;
    }
`;

const cloudFragmentShader = /* glsl */ `
    uniform float uWarmth;
    uniform float uCloudOpacity;
    varying vec2 vUv;
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
        return noise(p) * 0.57 + noise(p * 2.13 + 7.1) * 0.28
            + noise(p * 4.37 + 19.4) * 0.15;
    }
    void main() {
        vec2 p = vUv * 2.0 - 1.0;
        vec2 seed = vec2(vSeed, vSeed * 0.37);
        vec2 warp = vec2(smoke(p * 2.3 + seed), smoke(p * 2.3 + seed + 31.0));
        float density = smoke(p * 3.7 + warp * 2.2 + seed);
        float edge = 1.0 - smoothstep(0.28, 0.95, length(p + (warp - 0.5) * 0.28));
        // Eroded holes and a soft boundary produce isolated smoke, never a
        // rectangular overlay or a continuous bright band across the scene.
        float holes = smoothstep(0.28, 0.64, smoke(p * 2.8 + seed + 83.0));
        float alpha = edge * holes * smoothstep(0.25, 0.7, density) * vFade * 0.095;
        vec3 colour = mix(vec3(0.17, 0.052, 0.009), vec3(0.36, 0.125, 0.014), density);
        float tintMask = smoothstep(0.2, 0.65, noise(p * 1.8 + seed + 41.0));
        vec3 tint = mix(vec3(0.38, 0.19, 0.012), vec3(0.4, 0.045, 0.006),
            noise(p * 2.1 + seed + uWarmth * 3.0));
        // Change chroma within selected smoky pockets, preserving luminance
        // instead of raising opacity or washing the black gaps with colour.
        vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
        tint *= dot(colour, luminance) / dot(tint, luminance);
        colour = mix(colour, tint, tintMask * (0.75 + uWarmth * 0.25));
        gl_FragColor = vec4(colour, alpha * uCloudOpacity);
        #include <colorspace_fragment>
    }
`;

function createField(count: number, volume: number, dust: boolean, loadSeed: number) {
    const positions = new Float32Array(count * 3);
    const styles = new Float32Array(count * 4);
    // Preserve the broad composition and perturb its details with an independent
    // load seed. Density and brightness have a slight downward bias to keep
    // variation from gradually making the field brighter.
    const random = seededRandom(dust ? 8191 : 137);
    const variation = seededRandom((loadSeed + (dust ? 8191 : 137)) % 4_294_967_296);
    const density = 0.9 + variation() * 0.1;
    const warmth = variation();
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
        for (let index = 0; index < filaments.length; index += 4) {
            const filament = filaments[index];
            for (const t of [-0.45, 0.25]) {
                point
                    .copy(filament.centre)
                    .addScaledVector(filament.direction, t * filament.length)
                    .addScaledVector(
                        filament.sideways,
                        Math.sin(t * 3 + filament.phase) * filament.bend
                    );
                cloudCentres.push(point.x, point.y, point.z);
                cloudStyles.push(8 + filament.width * 7, 5 + filament.width * 4, filament.phase);
            }
        }
    }
    return {
        cloudCentres: new Float32Array(cloudCentres),
        cloudStyles: new Float32Array(cloudStyles),
        density,
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
            uPixelRatio: { value: 1 },
            uTime: { value: 0 },
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
