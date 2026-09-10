import { Filter } from 'pixi.js';
import { FILTER_VERTEX } from './filter-vertex';
import type { Hat } from '../../simulation';

/** One small bounded accessory pass. Pure recorded-clock glints preserve the
 * original painted ink and alpha; reduced motion keeps only a static gentle palette. */
export class CostumeSheen {
  readonly filter = Filter.from({
    gl: {
      vertex: FILTER_VERTEX,
      fragment: `
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uMode;
uniform float uGentle;
uniform float uMotion;
void main() {
  vec4 source = texture(uTexture, vTextureCoord);
  vec3 c = source.rgb / max(source.a, 0.0001);
  float ink = smoothstep(0.13, 0.43, max(c.r,max(c.g,c.b)));
  float red = smoothstep(0.12,0.36,c.r-c.g)*smoothstep(0.06,0.25,c.r-c.b);
  c = mix(c, vec3(c.r*0.76,c.g+0.14,c.r*0.95), red*uGentle);
  vec2 uv = vFilterCoord;
  if (uMode < 1.5) {
    float sweep = pow(max(0.0,sin((uv.x+uv.y*0.55)*8.0-uTime*1.8)),22.0);
    float faceted = step(0.38,fract(uv.x*12.0+floor(uv.y*11.0)*0.37));
    vec3 rainbow = 0.65+0.35*cos(vec3(0.0,2.1,4.2)+uv.y*4.0+uTime*0.7);
    c += rainbow * sweep * (0.11+0.1*faceted) * ink * uMotion;
  } else {
    float glow = (0.5+0.5*sin(uTime*2.4-uv.y*5.0))*red*0.08;
    c += vec3(0.7,0.25,0.16)*glow*ink*uMotion;
  }
  finalColor = vec4(clamp(c,0.0,1.0)*source.a,source.a);
}`,
    },
    padding: 0,
    resolution: 'inherit',
    resources: {
      costume: {
        uTime: { value: 0, type: 'f32' },
        uMode: { value: 0, type: 'f32' },
        uGentle: { value: 0, type: 'f32' },
        uMotion: { value: 0, type: 'f32' },
      },
    },
  });
  update(hat: Hat, time: number, reduced: boolean, gentle: boolean) {
    const u = this.filter.resources.costume.uniforms;
    u.uTime = reduced ? 0 : time;
    u.uMode = hat === 'disco' ? 1 : 2;
    u.uGentle = gentle ? 1 : 0;
    u.uMotion = reduced ? 0 : 1;
    this.filter.enabled =
      ['disco', 'brain', 'sausage'].includes(hat) && (!reduced || gentle);
  }
  dispose() {
    this.filter.destroy();
  }
}
