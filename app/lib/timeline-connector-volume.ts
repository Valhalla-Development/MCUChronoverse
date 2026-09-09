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
    Vector3,
} from "three";
import { createTemporalPlasmaFragmentShader } from "./timeline-energy-shaders";

const EFFECT_SCALE = 0.23;
const RADIUS = 0.68;
const SAMPLES = 64;

/** A shared local volume lets every connector use the stream shader in two instanced batches. */
export function createTimelineConnectorVolume(curve: Curve<Vector3>, cardConnection = false) {
    const points = curve.getSpacedPoints(256);
    const bounds = new Box3().setFromPoints(points);
    const margin = RADIUS * EFFECT_SCALE + (cardConnection ? 0.11 : 0);
    if (cardConnection) {
        bounds.min.x -= margin;
        bounds.max.x += margin;
    } else {
        bounds.min.y -= margin;
        bounds.max.y += margin;
    }
    bounds.min.z -= margin;
    bounds.max.z += margin;
    const size = bounds.getSize(new Vector3());
    const centre = bounds.getCenter(new Vector3());
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    geometry.translate(centre.x, centre.y, centre.z);

    // The main shader samples along x; card connections use their local y as that axis.
    const toVolume = (point: Vector3) => {
        if (cardConnection) {
            point.set(point.y, point.x, point.z);
        }
        return point.divideScalar(EFFECT_SCALE);
    };
    points.forEach(toVolume);
    toVolume(bounds.min);
    toVolume(bounds.max);
    const data = new Float32Array((SAMPLES + 1) * 4);
    const length = curve.getLength() / EFFECT_SCALE;
    const interpolatedPoint = new Vector3();
    let interval = 0;
    for (let index = 0; index <= SAMPLES; index += 1) {
        const x = bounds.min.x + (index / SAMPLES) * (bounds.max.x - bounds.min.x);
        while (interval < points.length - 2 && points[interval + 1].x < x) {
            interval += 1;
        }
        const start = points[interval];
        const end = points[interval + 1];
        const fraction = (x - start.x) / Math.max(end.x - start.x, 0.000_001);
        interpolatedPoint.lerpVectors(start, end, fraction).toArray(data, index * 4);
        data[index * 4 + 3] = ((interval + fraction) / (points.length - 1)) * length;
    }
    const texture = new DataTexture(data, SAMPLES + 1, 1, RGBAFormat, FloatType);
    texture.needsUpdate = true;

    return {
        createMaterial: () =>
            new ShaderMaterial({
                blending: AdditiveBlending,
                depthTest: false,
                depthWrite: false,
                fragmentShader: createTemporalPlasmaFragmentShader({
                    camera: "vLocalCamera",
                    curveTransform: /* glsl */ `
                    float envelope = smoothstep(0.14, 0.23, progress * vLength)
                        * pow(sin(progress * 3.141593), 2.0) * uConnection;
                    float phase = vSeed * 6.283185;
                    float bend = sin(progress * (3.141593 + vSeed * 3.0) + phase);
                    float drift = sin(progress * 6.283185 + uTime * (0.4 + vSeed * 0.25) + phase)
                        * 0.012 * uMotion;
                    curveSample.y += envelope * (bend * (0.045 + vSeed * 0.045) + drift) / ${EFFECT_SCALE};
                    curveSample.z += envelope * cos(progress * 4.7 + phase) * (0.015 + vSeed * 0.02) / ${EFFECT_SCALE};

                    // Arms keep exact endpoints while varying their crest, sweep, and depth.
                    float armEnvelope = pow(sin(progress * 3.141593), 1.35)
                        * (1.0 - uConnection);
                    float crest = mix(-0.09, 0.085, vSeed)
                        + sin(progress * 3.141593 * mix(1.1, 1.95, vSeed) + phase) * 0.035;
                    float sweep = sin(progress * 6.283185 + phase) * mix(0.012, 0.045, vSeed);
                    float crestShift = (vSeed - 0.5) * 0.13;
                    curveSample.x += armEnvelope * crestShift / ${EFFECT_SCALE};
                    curveSample.y += armEnvelope * crest / ${EFFECT_SCALE};
                    curveSample.z += armEnvelope * sweep / ${EFFECT_SCALE};
                `,
                    declarations: /* glsl */ `
                    uniform float uConnection;
                    uniform float uMotion;
                    varying vec3 vLocalCamera;
                    varying vec3 vAccent;
                    varying float vSeed;
                    varying float vLength;
                `,
                    emissionTransform: /* glsl */ `
                    // Retain the hot core and remap only the coloured plasma around it.
                    float progress = clamp(along / ${length}, 0.0, 1.0);
                    vec3 accent = mix(vAccent, vec3(1.0, 0.26, 0.034),
                        smoothstep(0.1, 0.85, progress) * (1.0 - uConnection));
                    float hot = hotShoulder * (0.55 + heat * 0.28);
                    vec3 core = vec3(1.0, 0.91, 0.64) * hot;
                    float colouredEnergy = max(emission.r - core.r, 0.0);
                    emission = core + accent * colouredEnergy;
                    emission += vec3(1.0, 0.97, 0.86) * exp(-pow(radius / 0.026, 2.0));
                `,
                }),
                side: BackSide,
                toneMapped: false,
                transparent: true,
                uniforms: {
                    uBoundsMax: { value: bounds.max },
                    uBoundsMin: { value: bounds.min },
                    uConnection: { value: cardConnection ? 1 : 0 },
                    uCurve: { value: texture },
                    uCurveSize: { value: SAMPLES + 1 },
                    uMotion: { value: 1 },
                    uNodeSpacing: { value: length },
                    uRadius: { value: RADIUS },
                    uTime: { value: 0 },
                },
                vertexShader: /* glsl */ `
                uniform float uConnection;
                varying vec3 vSurface;
                varying vec3 vLocalCamera;
                varying vec3 vAccent;
                varying float vSeed;
                varying float vLength;
                vec3 volumePoint(vec3 point) {
                    return mix(point, point.yxz, uConnection) / ${EFFECT_SCALE};
                }
                void main() {
                    mat4 transform = modelMatrix * instanceMatrix;
                    mat3 basis = mat3(transform);
                    vec3 offset = cameraPosition - transform[3].xyz;
                    // Invert the orthogonal instance basis without a per-frame CPU matrix inverse.
                    vec3 localCamera = vec3(dot(offset, basis[0]), dot(offset, basis[1]), dot(offset, basis[2]));
                    localCamera /= max(vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2])), vec3(0.000001));
                    vLocalCamera = volumePoint(localCamera);
                    vSurface = volumePoint(position);
                    vLength = length(instanceMatrix[1].xyz);
                    vec3 anchor = (instanceMatrix * vec4(0.0, -0.5 * uConnection, 0.0, 1.0)).xyz;
                    float sideSeed = step(0.0, instanceMatrix[0][0]) * 0.431;
                    vSeed = fract(
                        sin(floor(anchor.x * 10.0 + 0.5) * 12.9898) * 43758.5453
                        + sideSeed
                    );
                    vAccent = vec3(1.0, 0.26, 0.034);
                    #ifdef USE_INSTANCING_COLOR
                        vAccent = instanceColor;
                    #endif
                    gl_Position = projectionMatrix * viewMatrix * transform * vec4(position, 1.0);
                }
            `,
            }),
        geometry,
    };
}
