import { Filter } from 'pixi.js';
import { PONIES, type PonyId } from '../../catalogue/cosmetics';

/** Baked once per character part. Preserve ink, eyes, helmet and painted shading. */
export function ponyPalette(id: PonyId) {
  const palette = PONIES.find((p) => p.id === id)!;
  return Filter.from({
    gl: {
      vertex: `
        in vec2 aPosition;
        out vec2 vTextureCoord;
        uniform vec4 uInputSize;
        uniform vec4 uOutputFrame;
        uniform vec4 uOutputTexture;
        void main() {
          vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
          position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
          position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
          gl_Position = vec4(position, 0.0, 1.0);
          vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
        }
      `,
      fragment: `
      in vec2 vTextureCoord;
      out vec4 finalColor;
      uniform sampler2D uTexture;
      uniform vec3 uMane;
      uniform vec3 uCoat;
      void main() {
        vec4 source = texture(uTexture, vTextureCoord);
        vec3 c = source.rgb / max(source.a, 0.0001);
        float warm = smoothstep(0.03, 0.14, c.r - c.g);
        float hair = warm * smoothstep(0.015, 0.075, c.g - c.b) * (1.0 - smoothstep(0.65, 0.88, c.g)) * smoothstep(0.18, 0.35, c.r);
        float fur = smoothstep(0.48, 0.78, c.g) * smoothstep(0.18, 0.42, c.b) * smoothstep(-0.02, 0.07, c.r - c.b);
        float light = dot(c, vec3(0.3, 0.59, 0.11));
        vec3 hairColor = mix(uMane * 0.32, uMane, smoothstep(0.15, 0.7, light));
        hairColor = mix(hairColor, vec3(1.0), smoothstep(0.7, 0.95, light) * 0.6);
        vec3 furColor = uCoat * clamp(light / 0.88, 0.0, 1.12);
        c = mix(c, furColor, fur * 0.93);
        c = mix(c, hairColor, hair);
        finalColor = vec4(c * source.a, source.a);
      }
    `,
    },
    padding: 0,
    resolution: 1,
    resources: {
      palette: {
        uMane: { value: [...palette.mane], type: 'vec3<f32>' },
        uCoat: { value: [...palette.coat], type: 'vec3<f32>' },
      },
    },
  });
}
