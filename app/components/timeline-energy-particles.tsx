"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    type Curve,
    MathUtils,
    ShaderMaterial,
    Sphere,
    Vector3,
} from "three";

const MAX_PARTICLE_TRAVEL = 0.46;
const MAX_PARTICLE_RADIUS = 0.65;

const particleVertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uViewportHeight;
    uniform float uPixelRatio;
    attribute vec3 aTangent;
    attribute vec3 aNormal;
    attribute vec4 aLife;
    attribute vec4 aShape;
    attribute vec4 aStyle;
    varying vec4 vStyle;
    varying float vFragment;

    void main() {
        float life = fract(aLife.x + uTime / aLife.y);
        float fadeIn = smoothstep(0.0, 0.08 + aStyle.z * 0.08, life);
        float fadeOut = 1.0 - smoothstep(aStyle.w, 1.0, life);
        float radius = aShape.x + life * aLife.w;
        float angle = aShape.y;
        vec3 binormal = normalize(cross(aTangent, aNormal));

        // Travel stays local to the sampled curve segment. The path itself never moves.
        float drift = sin(life * 4.3 + aStyle.z * 23.0) * 0.012;
        vec3 radialOffset = aNormal * (cos(angle) * radius + drift)
            + binormal * (sin(angle) * radius - drift * 0.6);
        vec3 animatedPosition = position + radialOffset
            + aTangent * ((life - 0.5) * aLife.z);
        vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        float projectedSize = aShape.z * uViewportHeight * projectionMatrix[1][1]
            / max(-viewPosition.z, 0.1);
        float minimumSize = 0.75 * uPixelRatio;
        gl_PointSize = clamp(projectedSize, minimumSize, 8.0 * uPixelRatio);

        // Subpixel grains retain their area instead of becoming equal-sized bright dots.
        float coverage = min(1.0, projectedSize * projectedSize / (minimumSize * minimumSize));
        vStyle = vec4(aStyle.x * fadeIn * fadeOut * coverage, aStyle.yz, life);
        vFragment = aShape.w;
        gl_Position = projectionMatrix * viewPosition;
    }
`;

const particleFragmentShader = /* glsl */ `
    varying vec4 vStyle;
    varying float vFragment;

    void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float seed = vStyle.z * 31.73;
        float rotation = seed + vStyle.w * 0.35;
        mat2 rotate = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
        point = rotate * point;
        point.y *= mix(1.0, 1.45, vFragment);
        float distanceToCentre = length(point);
        float angle = atan(point.y, point.x);
        float irregularity = 1.0 + vFragment * (
            sin(angle * 3.0 + seed) * 0.12 + sin(angle * 5.0 - seed) * 0.08
        );
        float shape = 1.0 - smoothstep(0.25, 0.95, distanceToCentre * irregularity);
        float heart = exp(-distanceToCentre * distanceToCentre * 9.0);
        float alpha = shape * vStyle.x;
        if (alpha < 0.003) {
            discard;
        }

        vec3 orange = vec3(1.0, 0.24 + vStyle.z * 0.16, 0.025);
        vec3 hotGold = vec3(1.0, 0.80, 0.38);
        vec3 emission = mix(orange, hotGold, heart * (0.28 + vFragment * 0.55));
        gl_FragColor = vec4(emission * vStyle.y, alpha);
        #include <colorspace_fragment>
    }
`;

interface TimelineEnergyParticlesProps {
    compact: boolean;
    curve: Curve<Vector3>;
    eventCount: number;
    qualityFactor: number;
    reducedMotion: boolean;
}

function createParticleGeometry(
    curve: Curve<Vector3>,
    eventCount: number,
    compact: boolean,
    qualityFactor: number
) {
    const quality = MathUtils.clamp(qualityFactor, 0.35, 1);
    const length = curve.getLength();
    const density = (compact ? 80 : 116) * (0.6 + quality * 0.4);
    const limit = Math.round((compact ? 18_000 : 30_000) * (0.65 + quality * 0.35));
    const particleCount = Math.min(Math.max(Math.round(length * density), 160), limit);
    const sampleCount = Math.max(64, Math.min(eventCount * 12, 4096));
    const samples = curve.getSpacedPoints(sampleCount);
    const positions = new Float32Array(particleCount * 3);
    const tangents = new Float32Array(particleCount * 3);
    const normals = new Float32Array(particleCount * 3);
    const lives = new Float32Array(particleCount * 4);
    const shapes = new Float32Array(particleCount * 4);
    const styles = new Float32Array(particleCount * 4);
    const point = new Vector3();
    const tangent = new Vector3();
    const normal = new Vector3();
    let seed = 0x6d_63_75;
    const random = () => {
        seed = (seed * 48_271) % 2_147_483_647;
        return seed / 2_147_483_647;
    };

    for (let index = 0; index < particleCount; index += 1) {
        const progress = random();
        const sampleProgress = progress * sampleCount;
        const sampleIndex = Math.min(Math.floor(sampleProgress), sampleCount - 1);
        const start = samples[sampleIndex];
        const end = samples[sampleIndex + 1];
        point.lerpVectors(start, end, sampleProgress - sampleIndex);
        tangent.subVectors(end, start).normalize();
        normal.set(0, 1, 0);
        if (Math.abs(tangent.y) >= 0.9) {
            normal.set(0, 0, 1);
        }
        normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
        point.toArray(positions, index * 3);
        tangent.toArray(tangents, index * 3);
        normal.toArray(normals, index * 3);

        // Most grains hug the plasma; uncommon fragments share its volume and short lifetime.
        const fragment = random() > 0.988;
        const escaping = random() > 0.965;
        const radius = escaping ? 0.3 + random() * 0.25 : 0.05 + random() ** 2.5 * 0.27;
        const size = fragment ? 0.023 + random() * 0.012 : 0.004 + random() ** 3 * 0.011;
        const travel = Math.min(
            0.08 + random() * (MAX_PARTICLE_TRAVEL - 0.08),
            length * Math.min(progress, 1 - progress) * 1.8
        );
        const direction = random() > 0.16 ? 1 : -1;
        lives.set(
            [
                random(),
                fragment ? 2.4 + random() * 2.5 : 3.8 + random() * 5.2,
                travel * direction,
                0.015 + random() * 0.065,
            ],
            index * 4
        );
        shapes.set([radius, random() * Math.PI * 2, size, fragment ? 1 : 0], index * 4);
        styles.set(
            [
                fragment ? 0.7 + random() * 0.25 : 0.24 + random() ** 1.5 * 0.64,
                fragment ? 2.1 + random() * 1.1 : 0.85 + random() * 0.85,
                random(),
                0.5 + random() * 0.3,
            ],
            index * 4
        );
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aTangent", new BufferAttribute(tangents, 3));
    geometry.setAttribute("aNormal", new BufferAttribute(normals, 3));
    geometry.setAttribute("aLife", new BufferAttribute(lives, 4));
    geometry.setAttribute("aShape", new BufferAttribute(shapes, 4));
    geometry.setAttribute("aStyle", new BufferAttribute(styles, 4));
    geometry.computeBoundingBox();
    // Shader offsets must be included so culling remains correct near the ends of the stream.
    geometry.boundingBox?.expandByScalar(MAX_PARTICLE_RADIUS + MAX_PARTICLE_TRAVEL + 0.04);
    geometry.boundingSphere = new Sphere();
    geometry.boundingBox?.getBoundingSphere(geometry.boundingSphere);
    return geometry;
}

export function TimelineEnergyParticles({
    compact,
    curve,
    eventCount,
    qualityFactor,
    reducedMotion,
}: TimelineEnergyParticlesProps) {
    const geometry = useMemo(
        () => createParticleGeometry(curve, eventCount, compact, qualityFactor),
        [compact, curve, eventCount, qualityFactor]
    );
    const material = useMemo(
        () =>
            new ShaderMaterial({
                blending: AdditiveBlending,
                depthWrite: false,
                fragmentShader: particleFragmentShader,
                toneMapped: false,
                transparent: true,
                uniforms: {
                    uPixelRatio: { value: 1 },
                    uTime: { value: 0 },
                    uViewportHeight: { value: 1 },
                },
                vertexShader: particleVertexShader,
            }),
        []
    );

    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);

    useFrame(({ clock, gl, size }) => {
        const pixelRatio = gl.getPixelRatio();
        material.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
        material.uniforms.uViewportHeight.value = size.height * pixelRatio;
        material.uniforms.uPixelRatio.value = pixelRatio;
    });

    return <points dispose={null} geometry={geometry} material={material} renderOrder={4} />;
}
