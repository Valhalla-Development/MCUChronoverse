// Shared world-scale noise keeps the material's grain consistent when filtering the archive.
export const energyNoise = /* glsl */ `
    float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
                mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
                mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z
        );
    }
`;

export const temporalCoreVertexShader = /* glsl */ `
    varying vec3 vPosition;

    void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export function createTemporalCoreFragmentShader(merge = false) {
    return /* glsl */ `
    uniform float uTime;
    ${merge ? "uniform float uEndX; uniform float uMergeFadeLength;" : ""}
    varying vec3 vPosition;
    ${energyNoise}

    void main() {
        float heat = noise3(vPosition * vec3(3.4, 0.8, 0.8) - vec3(uTime * 0.24, 0, 0));
        vec3 ivory = mix(vec3(1.0, 0.88, 0.57), vec3(1.0, 0.985, 0.87), heat);
        gl_FragColor = vec4(ivory, ${merge ? "smoothstep(0.0, uMergeFadeLength, uEndX - vPosition.x)" : "1.0"});
    }
`;
}

export const temporalCoreFragmentShader = createTemporalCoreFragmentShader();

export const temporalPlasmaVertexShader = /* glsl */ `
    varying vec3 vSurface;

    void main() {
        vSurface = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vSurface, 1.0);
    }
`;

/** Keep the volume integration identical for the main stream and its local connector curves. */
export function createTemporalPlasmaFragmentShader({
    camera = "cameraPosition",
    curveTransform = "",
    declarations = "",
    emissionTransform = "",
} = {}) {
    return /* glsl */ `
    uniform float uTime;
    uniform float uRadius;
    uniform float uNodeSpacing;
    uniform float uCurveSize;
    uniform sampler2D uCurve;
    uniform vec3 uBoundsMin;
    uniform vec3 uBoundsMax;
    varying vec3 vSurface;
    ${energyNoise}
    ${declarations}

    vec4 curveAt(float x) {
        float progress = clamp((x - uBoundsMin.x) / (uBoundsMax.x - uBoundsMin.x), 0.0, 1.0);
        float index = progress * (uCurveSize - 1.0);
        float first = floor(index);
        vec4 a = texture2D(uCurve, vec2((first + 0.5) / uCurveSize, 0.5));
        vec4 b = texture2D(uCurve, vec2((min(first + 1.0, uCurveSize - 1.0) + 0.5) / uCurveSize, 0.5));
        vec4 curveSample = mix(a, b, fract(index));
        ${curveTransform}
        return curveSample;
    }

    void main() {
        vec3 cameraOrigin = ${camera};
        vec3 ray = normalize(vSurface - cameraOrigin);
        // A closed proxy supplies one exit face from every angle, including from inside.
        // Clip parallel ray components explicitly instead of dividing by a near-zero angle.
        vec3 safeRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray)) * max(abs(ray), vec3(0.000001));
        vec3 nearTimes = (uBoundsMin - cameraOrigin) / safeRay;
        vec3 farTimes = (uBoundsMax - cameraOrigin) / safeRay;
        vec3 lower = min(nearTimes, farTimes);
        vec3 upper = max(nearTimes, farTimes);
        float entry = max(0.0, max(lower.x, max(lower.y, lower.z)));
        float exit = min(upper.x, min(upper.y, upper.z));
        if (exit <= entry) discard;

        // Centre the bounded optical depth on the stream, not the empty space where a
        // shallow ray first enters its box. This preserves energy at long viewing angles.
        float raySpan = min(exit - entry, 6.0);
        vec2 radialOrigin = cameraOrigin.yz - (uBoundsMin.yz + uBoundsMax.yz) * 0.5;
        float radialSpeed = dot(ray.yz, ray.yz);
        float centreTime = radialSpeed > 0.000001
            ? -dot(radialOrigin, ray.yz) / radialSpeed
            : entry + raySpan * 0.5;
        entry = clamp(centreTime - raySpan * 0.5, entry, exit - raySpan);
        float stepLength = raySpan / 5.0;
        float time = uTime;
        float plasma = 0.0;
        float filaments = 0.0;
        float grains = 0.0;
        float radius = uRadius;
        float along = 0.0;
        vec3 startPoint = cameraOrigin + ray * entry;
        vec4 curveStart = curveAt(startPoint.x);
        for (int sampleIndex = 0; sampleIndex < 5; sampleIndex++) {
            float startTime = entry + float(sampleIndex) * stepLength;
            vec3 endPoint = cameraOrigin + ray * (startTime + stepLength);
            vec4 curveEnd = curveAt(endPoint.x);
            vec3 samplePoint = cameraOrigin + ray * (startTime + stepLength * 0.5);
            vec4 centre = mix(curveStart, curveEnd, 0.5);
            vec2 crossSection = samplePoint.yz - centre.yz;
            float radialDistance = length(crossSection);

            // Measure the closest point on the sampled curve segment for the narrow bloom.
            // Using actual curve points avoids the false luminous rings of tangent extrapolation.
            vec3 segment = curveEnd.xyz - curveStart.xyz;
            vec3 origin = curveStart.xyz - cameraOrigin;
            float raySegment = dot(ray, segment);
            float denominator = max(dot(segment, segment) - raySegment * raySegment, 0.000001);
            float fraction = clamp((raySegment * dot(ray, origin) - dot(segment, origin)) / denominator, 0.0, 1.0);
            vec3 nearest = origin + segment * fraction;
            float rayTime = clamp(dot(ray, nearest), entry, exit);
            float distanceToCurve = length(nearest - ray * rayTime);
            if (distanceToCurve < radius) {
                radius = distanceToCurve;
                along = mix(curveStart.w, curveEnd.w, fraction);
            }

            float travel = centre.w;
            vec3 p = vec3(travel * 2.3 - time * 0.30, crossSection * 7.0);
            float broad = noise3(p + vec3(0, time * 0.08, -time * 0.055));
            vec3 warped = p * vec3(2.2, 1.7, 1.7) + (broad - 0.5) * 2.8;
            float detail = noise3(warped + vec3(time * 0.11, 7.2, 3.6));
            float fine = noise3(warped * 3.1 - vec3(time * 0.16, 0, time * 0.06));
            float density = broad * 0.48 + detail * 0.35 + fine * 0.17;
            float bodyRadius = 0.17 + broad * 0.25 + detail * 0.10;
            float endDistance = min(samplePoint.x - uBoundsMin.x, uBoundsMax.x - samplePoint.x);
            float endFade = smoothstep(0.0, min(0.18, (uBoundsMax.x - uBoundsMin.x) * 0.25), endDistance);
            float body = (1.0 - smoothstep(0.045, bodyRadius, radialDistance)) * endFade;
            float breakup = smoothstep(0.23, 0.72, density);
            float tendrils = pow(max(0.0, 1.0 - abs(detail - 0.5) * 9.0), 3.0);
            float outer = exp(-radialDistance * radialDistance * 13.0) * endFade;
            plasma += body * breakup * (0.48 + fine * 0.8);
            filaments += tendrils * outer * smoothstep(0.30, 0.68, broad) * 0.34;

            // Filter subpixel grain into density at distance to prevent crawling or flashing.
            vec3 grainCoordinate = vec3(travel * 115.0 - time * 2.6, crossSection * 170.0);
            float grain = noise3(grainCoordinate);
            float grainResolution = 1.0 - smoothstep(0.65, 1.6, length(fwidth(grainCoordinate)));
            grains += pow(smoothstep(0.52, 0.88, grain), 3.0)
                * body * (0.3 + breakup) * grainResolution;
            curveStart = curveEnd;
        }
        float integration = min(raySpan, uRadius * 2.0) / 5.0;
        plasma *= integration;
        filaments *= integration;
        grains *= integration;
        float heat = noise3(vec3(along * 2.8 - time * 0.22, time * 0.035, 4.7));
        float nodeDistance = abs(fract(along / max(uNodeSpacing, 0.0001) + 0.5) - 0.5) * uNodeSpacing;
        float nodeHeat = exp(-nodeDistance * nodeDistance * 28.0) * (0.65 + heat * 0.35);

        // Analytic emission shoulders provide local, structured bloom without exposing cards.
        float hotShoulder = exp(-pow(radius / 0.043, 2.0));
        float gold = exp(-pow(radius / (0.075 + heat * 0.015), 2.0));
        float orange = exp(-pow(radius / 0.155, 2.0));
        float atmosphere = exp(-pow(radius / 0.40, 2.0));
        vec3 emission = vec3(1.0, 0.91, 0.64) * hotShoulder * (0.55 + heat * 0.28);
        emission += vec3(1.0, 0.59, 0.12) * gold * (0.40 + heat * 0.22);
        emission += vec3(1.0, 0.22, 0.018) * orange * (0.10 + heat * 0.05);
        emission += vec3(1.0, 0.26, 0.034) * plasma * (1.65 + nodeHeat * 0.3);
        emission += vec3(1.0, 0.37, 0.075) * filaments * 1.9;
        emission += vec3(1.0, 0.60, 0.23) * grains * 2.2;
        emission += vec3(0.065, 0.012, 0.002) * atmosphere * (0.65 + heat * 0.35);
        emission += vec3(0.11, 0.039, 0.005) * nodeHeat * exp(-radius * radius * 32.0);
        float edgeFade = 1.0 - smoothstep(uRadius * 0.72, uRadius, radius);
        ${emissionTransform}
        gl_FragColor = vec4(emission * edgeFade, 1.0);
    }
`;
}

export const temporalPlasmaFragmentShader = createTemporalPlasmaFragmentShader();
