import { Filter } from 'pixi.js';
import { FILTER_VERTEX } from './filter-vertex';

// Polar arms/ring noise adapted with permission from Slot's featurePortalVortexFilter.
// The one-second collapse matches the existing black-hole release physics.
export function portalVortex() {
  return Filter.from({
    gl: {
      vertex: FILTER_VERTEX,
      fragment: `
in vec2 vFilterCoord;
out vec4 finalColor;
uniform float uAge;
uniform float uTime;
uniform float uOpacity;
uniform float uGhost;
const float TAU = 6.28318530718;
float hash21(vec2 p) {
  p = fract(p * vec2(217.17, 311.41));
  p += dot(p, p + 43.27);
  return fract(p.x * p.y);
}
void main() {
  vec2 p = vFilterCoord - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);
  float release = max(0.0, uAge - 1.0);
  float charge = min(1.0, uAge);
  float ringRadius = 0.30 - charge * charge * 0.11 + release * 0.9;
  ringRadius = mix(ringRadius, 0.29, uGhost);
  float wobble = sin(a * 7.0 + uTime * 8.0) * 0.007;
  float ring = exp(-pow((r - ringRadius - wobble) / 0.014, 2.0));
  float spin = uTime * (9.0 + charge * 7.0) - release * 70.0;
  float phase = a * 4.0 + r * 36.0 + spin;
  float arms = pow(max(0.0, 0.5 + 0.5 * sin(phase)), 3.0);
  float aperture = smoothstep(0.055, 0.14, r) * (1.0 - smoothstep(0.33, 0.48, r));
  float spiral = arms * aperture;
  float cell = floor((a / TAU + 0.5) * 34.0);
  float sparkRadius = fract(hash21(vec2(cell, 6.2)) - uTime * 0.55) * 0.42;
  float spark = exp(-pow((r - sparkRadius) / 0.006, 2.0));
  spark *= pow(max(0.0, cos(a * 34.0)), 24.0) * aperture;
  vec3 purple = vec3(0.56, 0.29, 0.92);
  vec3 mint = vec3(0.36, 1.0, 0.79);
  vec3 color = mix(purple, mint, clamp(arms * 0.65 + ring * 0.5 + uGhost * 0.7, 0.0, 1.0));
  color = mix(color, vec3(1.0, 0.98, 0.76), clamp(spark + ring * 0.5, 0.0, 1.0));
  float alpha = clamp(spiral * 0.7 + ring * 0.9 + spark * 0.9, 0.0, 1.0) * uOpacity;
  finalColor = vec4(color * alpha, alpha);
}
`,
    },
    padding: 0,
    resolution: 1,
    resources: {
      portal: {
        uAge: { value: 0, type: 'f32' },
        uTime: { value: 0, type: 'f32' },
        uOpacity: { value: 0, type: 'f32' },
        uGhost: { value: 0, type: 'f32' },
      },
    },
  });
}
