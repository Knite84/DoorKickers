# Third-party dependencies

No third-party artwork, fonts, textures, audio, models, or AI-generated art is included. Visuals are constructed from code in `src/scene.js` and wall geometry in `src/destruction.js`; gunfire audio is synthesised in `src/audio.js`.

Direct dependencies:

| Package | Role | License | Source |
| --- | --- | --- | --- |
| three | 3D rendering at runtime | MIT | https://github.com/mrdoob/three.js |
| vite | Development server and production bundler | MIT | https://github.com/vitejs/vite |

MIT permits commercial use, modification, and redistribution, with its copyright and license notice retained. The runtime Three.js notice is copied into `public/THREE-LICENSE.txt` so it ships with production builds. Vite and its transitive build dependencies retain their notices in their installed packages; a snapshot of the installed package license identifiers is in `docs/dependency-licenses.json`. Preserve applicable notices if redistributing those tools themselves. Recheck licenses when adding or upgrading dependencies.

Original game source is currently private/unlicensed pending the owner's choice. Dependency license requirements still apply. There are no game-runtime fees or required paid services in this prototype.
