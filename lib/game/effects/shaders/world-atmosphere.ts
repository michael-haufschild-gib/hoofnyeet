import { Mesh, Shader, type Renderer } from 'pixi.js';
import { SCENE_MESH_VERTEX, unitMeshQuad } from './scene-mesh';
import type { WorldId } from '../../content';
import { prepareMesh } from './prepare-pipelines';

const WORLDS: WorldId[] = [
  'farm',
  'candy',
  'carnival',
  'office',
  'moon',
  'afterlife',
];

// Slot nebulaStarfallVeil and spotlightSweep techniques, adapted to a single
// background mesh. No source texture, filter framebuffer, independent clock,
// flashing fullscreen color, or shader pass over the pony and controls.
const FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
uniform float uWorld;
uniform float uAspect;
uniform float uDrift;
uniform float uDetail;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float veil(vec2 p) {
  float n = noise(p)*0.57;
  n += noise(p*2.03+vec2(6.11,-9.27))*0.28;
  if (uDetail>0.75) n += noise(p*4.09+vec2(-3.8,7.1))*0.14;
  return n;
}
float beam(vec2 uv,float origin,float phase,float swing,float width) {
  vec2 d=vec2((uv.x-origin)*uAspect,uv.y-1.09);
  float angle=atan(d.x,-d.y)-sin(uTime*0.22+phase)*swing;
  float offset=angle/width;
  float cone=exp(-offset*offset);
  return cone*(1.0-smoothstep(0.1,1.65,length(d)));
}
void main() {
  vec2 uv=vUV;
  float t=uTime, drift=uDrift;
  vec3 color=vec3(1.0,0.92,0.65);
  float alpha=0.0;
  if (uWorld<0.5) {
    // Soft diagonal afternoon light, with sparse drifting pollen.
    float ray=pow(max(0.0,sin(uv.x*11.0+uv.y*4.3+t*0.065)),12.0);
    alpha=ray*0.065*(1.0-uv.y*0.45);
    vec2 grid=vec2(uv.x*uAspect*26.0+drift,uv.y*26.0+t*0.085);
    vec2 cell=floor(grid), point=fract(grid)-0.5;
    float pollen=exp(-dot(point,point)*145.0)*step(0.91,hash(cell));
    alpha+=pollen*0.23*(0.6+0.4*sin(t*0.7+hash(cell)*6.28));
  } else if (uWorld<1.5) {
    float wave=sin(uv.x*15.0+sin(uv.y*9.0-t*0.18)*1.6+drift*0.2);
    float swish=pow(max(0.0,wave),7.0);
    alpha=swish*smoothstep(0.3,0.85,uv.y)*0.09;
    color=mix(vec3(1.0,0.74,0.67),vec3(1.0,0.96,0.8),swish);
    vec2 grid=vec2(uv.x*uAspect*18.0-drift,uv.y*18.0+t*0.2);
    vec2 cell=floor(grid), local=fract(grid)-0.5;
    float circle=length(local);
    float bubble=(1.0-smoothstep(0.07,0.09,abs(circle-0.18)))*step(0.965,hash(cell));
    alpha+=bubble*smoothstep(0.35,0.7,uv.y)*0.14;
  } else if (uWorld<2.5) {
    float a=beam(uv,0.16,0.3,0.32,0.11);
    float b=beam(uv,0.82,2.1,0.38,0.085);
    float c=beam(uv,0.55,4.2,0.18,0.075);
    alpha=(a+b+c)*0.145;
    color=mix(vec3(1.0,0.72,0.54),vec3(0.63,0.78,1.0),clamp(b/(a+b+c+0.0001),0.0,1.0));
  } else if (uWorld<3.5) {
    float stripe=fract(uv.x*3.0+uv.y*0.6+drift*0.018);
    float window=smoothstep(0.2,0.25,stripe)*(1.0-smoothstep(0.48,0.57,stripe));
    alpha=window*smoothstep(0.1,0.7,uv.y)*0.055;
    color=vec3(0.83,1.0,0.85);
    vec2 grid=vec2(uv.x*uAspect*24.0+t*0.04,uv.y*24.0-t*0.13);
    vec2 local=fract(grid)-0.5;
    alpha+=exp(-dot(local,local)*150.0)*step(0.94,hash(floor(grid)))*0.18;
  } else if (uWorld<4.5) {
    vec2 flow=vec2(uv.x*uAspect*2.0+drift*0.04,uv.y*2.5);
    float n=veil(flow+vec2(t*0.018,-t*0.014));
    float curtain=pow(max(0.0,sin(uv.y*8.0+n*3.5+uv.x*2.0)),5.0);
    alpha=curtain*(1.0-smoothstep(0.4,0.94,uv.y))*0.16;
    color=mix(vec3(0.4,0.98,0.87),vec3(0.7,0.48,1.0),n);
    vec2 stars=vec2(uv.x*uAspect*38.0+drift*0.025,uv.y*38.0);
    vec2 local=fract(stars)-0.5;
    float seed=hash(floor(stars));
    float star=exp(-dot(local,local)*170.0)*step(0.985,seed);
    alpha+=star*(0.35+0.15*sin(t*0.75+seed*25.0));
    color=mix(color,vec3(0.94,0.97,1.0),star);
  } else {
    float bend=sin(uv.x*5.0+t*0.18)+sin(uv.x*9.0-t*0.12)*0.4;
    float ribbon=pow(max(0.0,sin(uv.y*19.0+bend+drift*0.025)),10.0);
    alpha=ribbon*smoothstep(0.25,0.85,uv.y)*0.1;
    float n=veil(vec2(uv.x*uAspect*3.0+t*0.018,uv.y*3.0-t*0.04));
    alpha+=smoothstep(0.46,0.79,n)*0.07;
    color=mix(vec3(0.55,1.0,0.9),vec3(0.8,0.67,1.0),n);
  }
  alpha=clamp(alpha,0.0,0.24)*(1.0-smoothstep(0.9,1.0,uv.y));
  finalColor=vec4(color*alpha,alpha)*vColor;
}
`;

/**
 * The single background weather mesh, one branch of its shader per world. It
 * paints behind the scene and never samples it, so nothing here can tint the
 * pony or the controls. `update` takes the scene clock in seconds and the
 * layout in pixels, and a `density` below 0.55 hides the mesh outright.
 * `prepare` compiles the pipeline once, `restoreGraphics` re-arms that after a
 * context loss, and `dispose` releases the mesh, shader and geometry it owns.
 */
export class WorldAtmosphere {
  private geometry = unitMeshQuad(0, 0);
  readonly view = new Mesh({
    label: 'world-atmosphere',
    geometry: this.geometry,
    shader: Shader.from({
      gl: { vertex: SCENE_MESH_VERTEX, fragment: FRAGMENT },
      resources: {
        weather: {
          uTime: { value: 0, type: 'f32' },
          uWorld: { value: 0, type: 'f32' },
          uAspect: { value: 1, type: 'f32' },
          uDrift: { value: 0, type: 'f32' },
          uDetail: { value: 1, type: 'f32' },
        },
      },
    }),
  });
  private prepared = false;
  update(
    world: WorldId,
    time: number,
    width: number,
    ground: number,
    cameraX: number,
    reduced: boolean,
    density: number,
  ) {
    this.view.visible = density >= 0.55;
    this.view.scale.set(width, Math.max(1, ground));
    this.view.alpha = density < 1 ? 0.65 : 1;
    const u = this.view.shader!.resources.weather.uniforms;
    u.uWorld = WORLDS.indexOf(world);
    u.uTime = reduced ? 0 : time;
    u.uAspect = width / Math.max(1, ground);
    u.uDrift = cameraX / 4200;
    u.uDetail = density;
  }
  prepare(renderer: Renderer) {
    if (this.prepared) return;
    prepareMesh(renderer, this.view);
    this.prepared = true;
  }
  restoreGraphics() {
    this.prepared = false;
  }
  dispose() {
    this.view.shader!.destroy();
    this.view.destroy();
    this.geometry.destroy();
  }
}
