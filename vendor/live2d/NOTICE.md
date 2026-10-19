# Live2D runtime provenance

- `live2d.min.js` is the original Cubism SDK 2.1 WebGL core archived at https://github.com/dylanNew/live2d/blob/master/webgl/Live2D/lib/live2d.min.js, as linked by the pixi-live2d-display maintainer. Downloaded 2026-10-18. SHA-256: `e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08`.
- `cubism2-runtime.js` adds only an existing-core guard around that unchanged source. It is bundled locally, with no CDN script loading, runtime eval, tracking or microphone initialization.
- The core is proprietary Live2D SDK software, not MIT. Its original copyright and license references are retained in `ReadMe.txt`. This local personal project does not claim ownership of the SDK or the user-provided model.
- pixi-live2d-display 0.4.0 and PixiJS 6.5.10 are MIT-licensed dependencies; their package licenses apply separately from the core and character assets. See their package metadata and license files.
- Upstream pixi-live2d-display mistakenly includes its gh-pages publishing tool as a runtime npm dependency. Our package override keeps that unused tool on a patched release; it is not imported or bundled into the browser.
