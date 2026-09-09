import { AdditiveBlending, ShaderMaterial } from "three";

/** One small billboard per anchor supplies bloom and sparks without lights or postprocessing. */
export function createTimelineNodeMaterial() {
    return new ShaderMaterial({
        blending: AdditiveBlending,
        depthWrite: false,
        fragmentShader: /* glsl */ `
            uniform float uTime;
            uniform float uMotion;
            varying vec2 vOffset;
            varying vec2 vStream;
            varying vec3 vAccent;
            varying float vFocus;
            varying float vSeed;
            void main() {
                vec2 p = vOffset;
                float r = length(p);
                float aa = max(fwidth(r), 0.001);
                float breath = 1.0 + sin(uTime * 1.15 + vSeed) * uMotion * (0.035 + vFocus * 0.035);
                float glow = exp(-r * r * 75.0) * 0.65 + exp(-r * r * 19.0) * 0.075;
                float halo = 1.0 - smoothstep(0.002, 0.002 + aa, abs(r - 0.185));
                vec2 stream = vec2(dot(p, vStream), dot(p, vec2(-vStream.y, vStream.x)));
                float bleed = exp(-stream.x * stream.x * 12.0 - stream.y * stream.y * 900.0) * 0.16;
                float sparks = 0.0;
                for (int i = 0; i < 4; i++) {
                    float seed = float(i) * 2.39996 + vSeed;
                    float angle = seed + uTime * 0.075;
                    vec2 spark = vec2(cos(angle), sin(angle)) * (0.255 + sin(seed * 3.0) * 0.045);
                    float radius = 0.003 + vFocus * 0.0015;
                    float visibility = 0.5 + 0.5 * sin(uTime * 0.65 + seed);
                    sparks += (1.0 - smoothstep(radius, radius + aa, length(p - spark))) * visibility;
                }
                float edge = 1.0 - smoothstep(0.42, 0.5, r);
                vec3 emission = vAccent * (glow * breath + halo * (0.12 + vFocus * 0.14) + bleed);
                emission += mix(vAccent, vec3(1.0), 0.35) * sparks * uMotion * (0.4 + vFocus * 0.45);
                gl_FragColor = vec4(emission * edge * (1.0 + vFocus * 0.45), 1.0);
                #include <colorspace_fragment>
            }
        `,
        toneMapped: false,
        transparent: true,
        uniforms: {
            uMotion: { value: 1 },
            uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
            uniform float uTime;
            uniform float uMotion;
            varying vec2 vOffset;
            varying vec2 vStream;
            varying vec3 vAccent;
            varying float vFocus;
            varying float vSeed;
            void main() {
                vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                vFocus = instanceMatrix[0][0] - 1.0;
                vSeed = instanceMatrix[3][0] * 2.71;
                vAccent = instanceColor;
                // Project the stream axis into the billboard so the light stays along the line.
                vec2 axis = (modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xy;
                vStream = length(axis) > 0.001 ? normalize(axis) : vec2(1.0, 0.0);
                float breath = sin(uTime * 1.15 + vSeed) * uMotion;
                float size = 1.0 + vFocus * 0.22 + breath * (0.012 + vFocus * 0.012);
                vOffset = position.xy;
                centre.xy += position.xy * size;
                gl_Position = projectionMatrix * centre;
            }
        `,
    });
}

/** A white-hot centre falls off into the accent at the sphere's limb instead of a flat disk. */
export function createTimelineNodeCoreMaterial() {
    return new ShaderMaterial({
        fragmentShader: /* glsl */ `
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vAccent;
            void main() {
                float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
                float heat = smoothstep(0.55, 0.94, facing);
                vec3 colour = mix(vAccent * (0.35 + facing * 0.5), vec3(1.0, 0.98, 0.94), heat);
                gl_FragColor = vec4(colour, 1.0);
                #include <colorspace_fragment>
            }
        `,
        toneMapped: false,
        uniforms: { uAccent: { value: [1, 1, 1] } },
        vertexShader: /* glsl */ `
            uniform vec3 uAccent;
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vAccent;
            void main() {
                vec4 point = vec4(position, 1.0);
                vAccent = uAccent;
                #ifdef USE_INSTANCING
                    point = instanceMatrix * point;
                #endif
                #ifdef USE_INSTANCING_COLOR
                    vAccent = instanceColor;
                #endif
                vec4 viewPosition = modelViewMatrix * point;
                vNormal = normalMatrix * normal;
                vView = -viewPosition.xyz;
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
    });
}
