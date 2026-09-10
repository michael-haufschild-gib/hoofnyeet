// Pixi v8 filter coordinates, also used by the authorized Slot shader adaptations.
/**
 * The Pixi v8 vertex stage for full-node filters. It maps the filter quad into
 * clip space and hands the fragment stage both `vTextureCoord`, for sampling
 * the input, and `vFilterCoord`, a 0..1 coordinate across the filtered region
 * that the shader effects use as their geometry space.
 */
export const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFilterCoord;
out vec2 vFilterTextureCoordScale;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vFilterCoord = aPosition;
  vFilterTextureCoordScale = uOutputFrame.zw * uInputSize.zw;
  vTextureCoord = aPosition * vFilterTextureCoordScale;
}
`;
