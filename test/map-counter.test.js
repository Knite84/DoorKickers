import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the tactical map kill counter exists before the frame loop updates it', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /id="map-kills"/);
  assert.match(source, /\$\('#map-kills'\)\.textContent\s*=\s*`\$\{state\.kills\}\/\$\{state\.guards\.length\}`/);
});
