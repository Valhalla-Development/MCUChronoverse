"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
    AdditiveBlending,
    BackSide,
    Box3,
    BoxGeometry,
    type Curve,
    DataTexture,
    FloatType,
    RGBAFormat,
    ShaderMaterial,
    TubeGeometry,
    Vector3,
} from "three";
import {
    createTemporalCoreFragmentShader,
    createTemporalPlasmaFragmentShader,
    temporalCoreFragmentShader,
    temporalCoreVertexShader,
    temporalPlasmaFragmentShader,
    temporalPlasmaVertexShader,
} from "../lib/timeline-energy-shaders";
import { TimelineEnergyParticles } from "./timeline-energy-particles";

const CORE_RADIUS = 0.026;
const PLASMA_RADIUS = 0.68;

interface TimelineEnergyProps {
    compact: boolean;
    curve: Curve<Vector3>;
    eventCount: number;
    mergeFadeLength?: number;
    qualityFactor: number;
    reducedMotion: boolean;
}

function createPlasmaVolume(curve: Curve<Vector3>, segments: number) {
    const points = curve.getSpacedPoints(segments);
    const bounds = new Box3().setFromPoints(points);
    const firstX = points[0].x;
    const span = Math.max(points.at(-1)?.x ?? firstX, firstX + 0.0001) - firstX;
    const samples = new Float32Array((segments + 1) * 4);
    const point = new Vector3();
    let interval = 0;

    // The chronology runs monotonically along x. Resample its existing arc-length points
    // at uniform x positions so every volume sample follows the real curve, even end-on.
    for (let index = 0; index <= segments; index += 1) {
        const x = firstX + (index / segments) * span;
        while (interval < segments - 1 && points[interval + 1].x < x) {
            interval += 1;
        }
        const start = points[interval];
        const end = points[interval + 1];
        const fraction = (x - start.x) / Math.max(end.x - start.x, 0.000_001);
        point.lerpVectors(start, end, fraction);
        point.toArray(samples, index * 4);
        samples[index * 4 + 3] = ((interval + fraction) / segments) * curve.getLength();
    }
    const texture = new DataTexture(samples, segments + 1, 1, RGBAFormat, FloatType);
    texture.needsUpdate = true;
    bounds.min.y -= PLASMA_RADIUS;
    bounds.min.z -= PLASMA_RADIUS;
    bounds.max.y += PLASMA_RADIUS;
    bounds.max.z += PLASMA_RADIUS;
    const size = bounds.getSize(new Vector3());
    const centre = bounds.getCenter(new Vector3());
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    geometry.translate(centre.x, centre.y, centre.z);
    return { bounds, geometry, texture };
}

export function TimelineEnergy({
    compact,
    curve,
    eventCount,
    mergeFadeLength = 0,
    qualityFactor,
    reducedMotion,
}: TimelineEnergyProps) {
    // Keep sampling and geometry stable during adaptive quality changes. The particle
    // density and frame cadence scale smoothly without replacing the visible material.
    const segments = Math.max(eventCount * 12, 96);
    const volume = useMemo(() => createPlasmaVolume(curve, segments), [curve, segments]);
    const coreGeometry = useMemo(
        () => new TubeGeometry(curve, segments, CORE_RADIUS, 10, false),
        [curve, segments]
    );
    const plasmaMaterial = useMemo(
        () =>
            new ShaderMaterial({
                blending: AdditiveBlending,
                depthTest: false,
                depthWrite: false,
                fragmentShader: mergeFadeLength
                    ? createTemporalPlasmaFragmentShader({
                          declarations:
                              "uniform float uMergeFadeLength; uniform float uCurveLength;",
                          emissionTransform:
                              "emission *= smoothstep(0.0, uMergeFadeLength, uCurveLength - along);",
                      })
                    : temporalPlasmaFragmentShader,
                side: BackSide,
                toneMapped: false,
                transparent: true,
                uniforms: {
                    uBoundsMax: { value: volume.bounds.max },
                    uBoundsMin: { value: volume.bounds.min },
                    uCurve: { value: volume.texture },
                    uCurveLength: { value: curve.getLength() },
                    uCurveSize: { value: segments + 1 },
                    uMergeFadeLength: { value: mergeFadeLength },
                    uNodeSpacing: { value: curve.getLength() / Math.max(eventCount - 1, 1) },
                    uRadius: { value: PLASMA_RADIUS },
                    uTime: { value: 0 },
                },
                vertexShader: temporalPlasmaVertexShader,
            }),
        [curve, eventCount, mergeFadeLength, segments, volume]
    );
    const coreMaterial = useMemo(
        () =>
            new ShaderMaterial({
                depthWrite: !mergeFadeLength,
                fragmentShader: mergeFadeLength
                    ? createTemporalCoreFragmentShader(true)
                    : temporalCoreFragmentShader,
                toneMapped: false,
                transparent: Boolean(mergeFadeLength),
                uniforms: {
                    uEndX: { value: curve.getPoint(1).x },
                    uMergeFadeLength: { value: mergeFadeLength },
                    uTime: { value: 0 },
                },
                vertexShader: temporalCoreVertexShader,
            }),
        [curve, mergeFadeLength]
    );

    useEffect(
        () => () => {
            volume.geometry.dispose();
            volume.texture.dispose();
        },
        [volume]
    );
    useEffect(() => () => coreGeometry.dispose(), [coreGeometry]);
    useEffect(() => () => plasmaMaterial.dispose(), [plasmaMaterial]);
    useEffect(() => () => coreMaterial.dispose(), [coreMaterial]);

    useFrame(({ clock }) => {
        const elapsed = reducedMotion ? 0 : clock.elapsedTime;
        plasmaMaterial.uniforms.uTime.value = elapsed;
        coreMaterial.uniforms.uTime.value = elapsed;
    });

    return (
        <group dispose={null}>
            <mesh geometry={volume.geometry} material={plasmaMaterial} renderOrder={1} />
            <mesh geometry={coreGeometry} material={coreMaterial} renderOrder={2} />
            <TimelineEnergyParticles
                compact={compact}
                curve={curve}
                eventCount={eventCount}
                qualityFactor={qualityFactor}
                reducedMotion={reducedMotion}
            />
        </group>
    );
}
