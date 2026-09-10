// Adapted with user authorization from Slot pixi-runtime kapowBurstFilter.ts.
// Same ray/halftone shader; standalone transparent effect, manual event clock.
import { Filter } from 'pixi.js';
import { FILTER_VERTEX } from './shaders/filter-vertex';
const fragment = `
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uDotScale;
uniform float uIntensity;
uniform float uOpacity;
uniform float uProgress;
uniform float uPunch;
uniform float uRayCount;
uniform float uTime;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;

const float TAU = 6.28318530718;

void main() {
    vec4 source = vec4(0.0);
    vec2 centered = vFilterCoord - 0.5;
    float r = length(centered);
    float ang = atan(centered.y, centered.x);

    float grow = uProgress < 0.55
        ? mix(0.45, 1.1, smoothstep(0.0, 0.55, uProgress))
        : mix(1.1, 1.0, smoothstep(0.55, 0.8, uProgress));
    float fade = 1.0 - smoothstep(0.72, 1.0, uProgress);

    float rays = step(0.5, fract(ang / TAU * uRayCount + 0.25));
    float rayInner = 0.16 * grow;
    float rayOuter = 0.52 * grow;
    float starburst = rays * smoothstep(rayInner, rayInner + 0.05, r) * (1.0 - smoothstep(rayOuter - 0.06, rayOuter, r));

    float ringR = 0.5 * grow;
    vec2 dotCell = fract(vFilterCoord * uDotScale) - 0.5;
    float dots = 1.0 - smoothstep(0.14, 0.3, length(dotCell));
    float dotRing = dots * smoothstep(ringR - 0.1, ringR - 0.02, r) * (1.0 - smoothstep(ringR + 0.02, ringR + 0.1, r));

    float impactFlash = exp(-pow(uProgress / 0.11, 2.0)) * uPunch;

    vec3 color = source.rgb;
    color = mix(color, vec3(1.0), clamp(impactFlash, 0.0, 1.0) * source.a);
    vec3 rayColor = mix(uPrimaryColor, uAccentColor, smoothstep(0.2, 0.5, r));
    color = mix(color, rayColor, starburst * fade * uIntensity * uOpacity);
    color = mix(color, uAccentColor, dotRing * fade * 0.9 * uIntensity * uOpacity);
    float alpha = max(source.a, clamp((starburst + dotRing) * fade * uIntensity, 0.0, 1.0) * uOpacity);
    finalColor = vec4(color * alpha, alpha);
}
`;
/**
 * A transparent impact flash: a ray starburst inside a halftone ring, painted
 * on an empty node rather than over the scene. The caller drives `uProgress`
 * 0..1 across the hit — it overshoots full size before settling, then fades
 * from 0.72 — with `uIntensity`, `uOpacity` and `uPunch` as 0..1 weights.
 */
export function comicBurst() {
  return Filter.from({
    gl: { vertex: FILTER_VERTEX, fragment },
    padding: 0,
    resolution: 1,
    resources: {
      burst: {
        uAccentColor: { value: [1, 0.39, 0.22], type: 'vec3<f32>' },
        uPrimaryColor: { value: [1, 0.88, 0.34], type: 'vec3<f32>' },
        uDotScale: { value: 22, type: 'f32' },
        uIntensity: { value: 1, type: 'f32' },
        uOpacity: { value: 1, type: 'f32' },
        uProgress: { value: 0, type: 'f32' },
        uPunch: { value: 0.7, type: 'f32' },
        uRayCount: { value: 11, type: 'f32' },
        uTime: { value: 0, type: 'f32' },
      },
    },
  });
}
