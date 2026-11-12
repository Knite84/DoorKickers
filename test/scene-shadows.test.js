import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Vector3 } from 'three';
import { buildWallPieces } from '../src/destruction.js';
import { createSceneLighting } from '../src/scene-lighting.js';
import { fitSunShadow, tuneSunShadow } from '../src/scene-shadows.js';
import { maps } from '../src/maps/index.js';

test('the fitted sun shadow frustum contains the structure on every map', () => {
  const corner = new Vector3();
  for (const map of Object.values(maps)) {
    const sun = new DirectionalLight();
    const lighting = createSceneLighting(map);
    sun.position.set(...lighting.sunDirection.map(value => value * 35));
    const pieces = buildWallPieces(map);
    fitSunShadow(sun, pieces);
    for (const { center, size } of pieces) {
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        corner.set(center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2);
        corner.project(sun.shadow.camera);
        assert.ok(Math.max(Math.abs(corner.x), Math.abs(corner.y), Math.abs(corner.z)) < 1, map.id);
      }
    }
    sun.shadow.mapSize.setScalar(1024);
    tuneSunShadow(sun.shadow);
    const lowBias = sun.shadow.normalBias;
    sun.shadow.mapSize.setScalar(2048);
    tuneSunShadow(sun.shadow);
    assert.ok(sun.shadow.normalBias < lowBias, map.id);
    lighting.dispose();
  }
});
