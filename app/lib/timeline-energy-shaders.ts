// Shared world-scale noise keeps the material's grain consistent when filtering the archive.
const energyNoise = /* glsl */ `
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

export const temporalCoreFragmentShader = /* glsl */ `
    uniform float uTime;
    varying vec3 vPosition;
    ${energyNoise}

    void main() {
        float heat = noise3(vPosition * vec3(3.4, 0.8, 0.8) - vec3(uTime * 0.24, 0, 0));
        vec3 ivory = mix(vec3(1.0, 0.88, 0.57), vec3(1.0, 0.985, 0.87), heat);
        gl_FragColor = vec4(ivory, 1.0);
    }
`;

export const temporalPlasmaVertexShader = /* glsl */ `
    attribute vec3 aCentre;
    attribute vec3 aTangent;
    attribute float aDistance;
    varying vec3 vSurface;
    varying vec3 vCentre;
    varying vec3 vTangent;
    varying float vDistance;

    void main() {
        vSurface = (modelMatrix * vec4(position, 1.0)).xyz;
        vCentre = (modelMatrix * vec4(aCentre, 1.0)).xyz;
        vTangent = mat3(modelMatrix) * aTangent;
        vDistance = aDistance;
        gl_Position = projectionMatrix * viewMatrix * vec4(vSurface, 1.0);
    }
`;

export const temporalPlasmaFragmentShader = /* glsl */ `
    uniform float uTime;
    uniform float uLength;
    uniform float uRadius;
    varying vec3 vSurface;
    varying vec3 vCentre;
    varying vec3 vTangent;
    varying float vDistance;
    ${energyNoise}

    void main() {
        vec3 tangent = normalize(vTangent);
        vec3 ray = normalize(vSurface - cameraPosition);
        vec3 normal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));
        vec3 binormal = cross(tangent, normal);
        vec3 offset = vSurface - vCentre;
        vec3 radialRay = ray - tangent * dot(ray, tangent);
        vec3 radialOffset = offset - tangent * dot(offset, tangent);
        float rayLengthSquared = max(dot(radialRay, radialRay), 0.025);
        float closestTime = -dot(radialOffset, radialRay) / rayLengthSquared;
        vec3 closest = offset + ray * closestTime;
        vec3 closestRadial = closest - tangent * dot(closest, tangent);
        float radius = length(closestRadial);
        float chord = sqrt(max(uRadius * uRadius - radius * radius, 0.0));
        float halfTravel = chord / sqrt(rayLengthSquared);
        float along = vDistance + dot(closest, tangent);
        float time = uTime;
        float heat = noise3(vec3(along * 2.8 - time * 0.22, time * 0.035, 4.7));

        // Integrate a few depths through the proxy, rather than lighting its smooth surface.
        // The centreline and proxy geometry never move; only the density field evolves.
        float plasma = 0.0;
        float filaments = 0.0;
        float grains = 0.0;
        for (int step = 0; step < PLASMA_SAMPLES; step++) {
            float depth = (float(step) + 0.5) / float(PLASMA_SAMPLES) * 2.0 - 1.0;
            vec3 samplePoint = closest + ray * (halfTravel * depth);
            vec2 crossSection = vec2(dot(samplePoint, normal), dot(samplePoint, binormal));
            float radialDistance = length(crossSection);
            float travel = vDistance + dot(samplePoint, tangent);
            vec3 p = vec3(travel * 2.3 - time * 0.30, crossSection * 7.0);
            float broad = noise3(p + vec3(0, time * 0.08, -time * 0.055));
            vec3 warped = p * vec3(2.2, 1.7, 1.7) + (broad - 0.5) * 2.8;
            float detail = noise3(warped + vec3(time * 0.11, 7.2, 3.6));
            float fine = noise3(warped * 3.1 - vec3(time * 0.16, 0, time * 0.06));
            float density = broad * 0.48 + detail * 0.35 + fine * 0.17;
            float bodyRadius = 0.17 + broad * 0.25 + detail * 0.10;
            float body = 1.0 - smoothstep(0.045, bodyRadius, radialDistance);
            float breakup = smoothstep(0.23, 0.72, density);
            float tendrils = pow(max(0.0, 1.0 - abs(detail - 0.5) * 9.0), 3.0);
            float outer = exp(-radialDistance * radialDistance * 13.0);
            plasma += body * breakup * (0.48 + fine * 0.8);
            filaments += tendrils * outer * smoothstep(0.30, 0.68, broad) * 0.34;

            // Filter subpixel grain into density at distance to prevent crawling or flashing.
            vec3 grainCoordinate = vec3(travel * 115.0 - time * 2.6, crossSection * 170.0);
            float grain = noise3(grainCoordinate);
            float grainResolution = 1.0 - smoothstep(0.65, 1.6, length(fwidth(grainCoordinate)));
            grains += pow(smoothstep(0.52, 0.88, grain), 3.0)
                * body * (0.3 + breakup) * grainResolution;
        }
        float integration = chord * 2.0 / float(PLASMA_SAMPLES);
        plasma *= integration;
        filaments *= integration;
        grains *= integration;

        // Analytic emission shoulders provide local, structured bloom without exposing cards.
        float hotShoulder = exp(-pow(radius / 0.043, 2.0));
        float gold = exp(-pow(radius / (0.075 + heat * 0.015), 2.0));
        float orange = exp(-pow(radius / 0.155, 2.0));
        float atmosphere = exp(-pow(radius / 0.40, 2.0));
        vec3 emission = vec3(1.0, 0.91, 0.64) * hotShoulder * (0.55 + heat * 0.28);
        emission += vec3(1.0, 0.59, 0.12) * gold * (0.40 + heat * 0.22);
        emission += vec3(1.0, 0.22, 0.018) * orange * (0.10 + heat * 0.05);
        emission += vec3(1.0, 0.26, 0.034) * plasma * 1.65;
        emission += vec3(1.0, 0.37, 0.075) * filaments * 1.9;
        emission += vec3(1.0, 0.60, 0.23) * grains * 2.2;
        emission += vec3(0.065, 0.012, 0.002) * atmosphere * (0.65 + heat * 0.35);
        float edgeFade = 1.0 - smoothstep(uRadius * 0.72, uRadius, radius);
        float endDistance = min(vDistance, uLength - vDistance);
        float endFade = smoothstep(0.0, min(0.18, uLength * 0.25), endDistance);
        gl_FragColor = vec4(emission * edgeFade * endFade, 1.0);
    }
`;
