import { AdditiveBlending, Color, ShaderMaterial } from "three";

const ringVertexShader = /* glsl */ `
    varying vec3 vRingOffset;
    varying float vNodeSeed;
    varying vec2 vRingUv;

    void main() {
        vec4 ringPosition = vec4(position, 1.0);
        vec4 nodeCentre = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
            ringPosition = instanceMatrix * ringPosition;
            nodeCentre = instanceMatrix * nodeCentre;
        #endif
        vec4 worldPosition = modelMatrix * ringPosition;
        vec3 worldCentre = (modelMatrix * nodeCentre).xyz;
        vRingOffset = worldPosition.xyz - worldCentre;
        vNodeSeed = fract(
            sin(dot(worldCentre, vec3(12.9898, 78.233, 43.271))) * 43758.5453
        );
        vRingUv = uv;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const ringFragmentShader = /* glsl */ `
    uniform vec3 uColour;
    uniform float uOpacity;
    uniform float uTime;
    varying vec3 vRingOffset;
    varying float vNodeSeed;
    varying vec2 vRingUv;

    void main() {
        float phase = vNodeSeed * 23.71;
        float variation =
            sin(uTime * 0.61 + phase + vRingUv.x * 12.566371) * 0.055 +
            sin(uTime * 0.37 + phase * 1.73 - vRingUv.x * 31.415927) * 0.035;

        // The tilted orbit receives more heat where it approaches the stream's axis.
        float distanceToStream = length(vRingOffset.yz);
        float streamHeat = exp(-distanceToStream * distanceToStream * 22.0);
        float localHeat = streamHeat * (0.82 + sin(uTime * 0.43 + phase) * 0.08);
        vec3 gold = vec3(1.0, 0.79, 0.4);
        vec3 colour = mix(uColour, gold, localHeat * 0.18);
        colour *= 0.97 + variation + localHeat * 0.18;

        gl_FragColor = vec4(colour, uOpacity * (0.96 + variation * 0.35));
        #include <colorspace_fragment>
    }
`;

/** Shared by each instanced orbit batch; node positions provide independent energy phases. */
export function createTimelineRingMaterial({
    colour,
    opacity,
}: {
    colour: string;
    opacity: number;
}): ShaderMaterial {
    return new ShaderMaterial({
        blending: AdditiveBlending,
        depthWrite: false,
        fragmentShader: ringFragmentShader,
        toneMapped: false,
        transparent: true,
        uniforms: {
            uColour: { value: new Color(colour) },
            uOpacity: { value: opacity },
            uTime: { value: 0 },
        },
        vertexShader: ringVertexShader,
    });
}
