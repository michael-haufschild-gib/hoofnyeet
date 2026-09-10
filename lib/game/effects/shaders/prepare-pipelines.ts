import {
  Mesh,
  Rectangle,
  Sprite,
  Texture,
  type Filter,
  type Renderer,
  type MeshGeometry,
  type Shader,
} from 'pixi.js';

/** Compile real pipelines on small owned targets without touching the scene,
 * sampling a gameplay event, or advancing any live effect clock. */
export function prepareFilters(renderer: Renderer, filters: readonly Filter[]) {
  for (const filter of filters) {
    const enabled = filter.enabled;
    const probe = new Sprite(Texture.WHITE);
    probe.width = probe.height = 16;
    probe.filters = [filter];
    try {
      filter.enabled = true;
      renderer.generateTexture({ target: probe, resolution: 1 }).destroy(true);
    } finally {
      filter.enabled = enabled;
      probe.filters = null;
      probe.destroy();
    }
  }
}

/**
 * Compiles the mesh's shader pipeline by rendering a borrowed copy into a tiny
 * throwaway texture, so the first real frame does not stall. It never touches
 * `source` or its place in the scene, and the probe deliberately leaves the
 * borrowed geometry and shader alive for the caller to dispose.
 */
export function prepareMesh(
  renderer: Renderer,
  source: Mesh<MeshGeometry, Shader>,
) {
  const probe = new Mesh({ geometry: source.geometry, shader: source.shader });
  try {
    renderer
      .generateTexture({
        target: probe,
        frame: new Rectangle(-1, -1, 2, 2),
        resolution: 8,
      })
      .destroy(true);
  } finally {
    // Mesh.destroy does not own the borrowed geometry or shader.
    probe.destroy();
  }
}
