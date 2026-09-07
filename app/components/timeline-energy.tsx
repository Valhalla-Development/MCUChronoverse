"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
    AdditiveBlending,
    BufferAttribute,
    type Curve,
    ShaderMaterial,
    TubeGeometry,
    type Vector3,
} from "three";
import {
    temporalCoreFragmentShader,
    temporalCoreVertexShader,
    temporalPlasmaFragmentShader,
    temporalPlasmaVertexShader,
} from "../lib/timeline-energy-shaders";

const CORE_RADIUS = 0.026;
const PLASMA_RADIUS = 0.68;
const RADIAL_SEGMENTS = 16;

interface TimelineEnergyProps {
    compact: boolean;
    curve: Curve<Vector3>;
    eventCount: number;
    qualityFactor: number;
    reducedMotion: boolean;
}

function createPlasmaGeometry(curve: Curve<Vector3>, segments: number): TubeGeometry {
    const geometry = new TubeGeometry(curve, segments, PLASMA_RADIUS, RADIAL_SEGMENTS, false);
    const vertexCount = (segments + 1) * (RADIAL_SEGMENTS + 1);
    const centres = new Float32Array(vertexCount * 3);
    const tangents = new Float32Array(vertexCount * 3);
    const distances = new Float32Array(vertexCount);
    const length = curve.getLength();

    // TubeGeometry uses arc-length sampling. Reuse that parameterization for the volume's
    // local frame so its energy stays attached to the existing chronology at every zoom.
    for (let segment = 0; segment <= segments; segment += 1) {
        const progress = segment / segments;
        const centre = curve.getPointAt(progress);
        const tangent = geometry.tangents[segment];
        for (let radial = 0; radial <= RADIAL_SEGMENTS; radial += 1) {
            const index = segment * (RADIAL_SEGMENTS + 1) + radial;
            centre.toArray(centres, index * 3);
            tangent.toArray(tangents, index * 3);
            distances[index] = progress * length;
        }
    }
    geometry.setAttribute("aCentre", new BufferAttribute(centres, 3));
    geometry.setAttribute("aTangent", new BufferAttribute(tangents, 3));
    geometry.setAttribute("aDistance", new BufferAttribute(distances, 1));
    return geometry;
}

export function TimelineEnergy({
    compact,
    curve,
    eventCount,
    qualityFactor,
    reducedMotion,
}: TimelineEnergyProps) {
    const segmentDensity = compact ? 7 + qualityFactor * 3 : 10 + qualityFactor * 6;
    const segments = Math.max(Math.round(eventCount * segmentDensity), 96);
    const samples = compact || qualityFactor < 0.5 ? 3 : 4;
    const plasmaGeometry = useMemo(() => createPlasmaGeometry(curve, segments), [curve, segments]);
    const coreGeometry = useMemo(
        () => new TubeGeometry(curve, segments, CORE_RADIUS, 10, false),
        [curve, segments]
    );
    const plasmaMaterial = useMemo(
        () =>
            new ShaderMaterial({
                blending: AdditiveBlending,
                defines: { PLASMA_SAMPLES: samples },
                depthWrite: false,
                fragmentShader: temporalPlasmaFragmentShader,
                toneMapped: false,
                transparent: true,
                uniforms: {
                    uLength: { value: curve.getLength() },
                    uRadius: { value: PLASMA_RADIUS },
                    uTime: { value: 0 },
                },
                vertexShader: temporalPlasmaVertexShader,
            }),
        [curve, samples]
    );
    const coreMaterial = useMemo(
        () =>
            new ShaderMaterial({
                fragmentShader: temporalCoreFragmentShader,
                toneMapped: false,
                uniforms: { uTime: { value: 0 } },
                vertexShader: temporalCoreVertexShader,
            }),
        []
    );

    useEffect(() => () => plasmaGeometry.dispose(), [plasmaGeometry]);
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
            <mesh geometry={plasmaGeometry} material={plasmaMaterial} renderOrder={1} />
            <mesh geometry={coreGeometry} material={coreMaterial} renderOrder={2} />
        </group>
    );
}
