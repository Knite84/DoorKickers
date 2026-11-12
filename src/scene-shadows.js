import { Box3, Vector3 } from 'three';

export function fitSunShadow(sun, structure) {
  if (!structure.length) return;
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const shadow = sun.shadow;
  shadow.updateMatrices(sun);

  const camera = shadow.camera;
  const bounds = new Box3();
  const corner = new Vector3();
  // Project the structure into the light's view. Keeping the fit independent
  // of the player camera keeps the shadow texel grid fixed while walking.
  for (const { center, size } of structure) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      corner.set(center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2);
      bounds.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
    }
  }
  const margin = 4;
  camera.left = bounds.min.x - margin;
  camera.right = bounds.max.x + margin;
  camera.bottom = bounds.min.y - margin;
  camera.top = bounds.max.y + margin;
  camera.near = Math.max(0.1, -bounds.max.z - margin);
  camera.far = -bounds.min.z + margin;
  camera.updateProjectionMatrix();
}

export function tuneSunShadow(shadow) {
  const { camera, mapSize } = shadow;
  const texel = Math.max(camera.right - camera.left, camera.top - camera.bottom) / mapSize.x;
  shadow.bias = -0.2 * texel / (camera.far - camera.near);
  shadow.normalBias = 0.4 * texel;
  shadow.radius = Math.max(1, Math.min(3, 0.045 / texel));
}
