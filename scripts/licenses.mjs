import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const packages = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  try {
    const pkg = JSON.parse(await readFile(new URL(`../${path}/package.json`, import.meta.url), 'utf8'));
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license ?? 'UNKNOWN', developmentOnly: entry.dev === true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // Platform-specific optional packages may not be installed.
  }
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await copyFile(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('../public/THREE-LICENSE.txt', import.meta.url));
await writeFile(new URL('../docs/dependency-licenses.json', import.meta.url), JSON.stringify(packages.sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n');
console.log(`Recorded ${packages.length} installed packages and copied the Three.js license.`);
