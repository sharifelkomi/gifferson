# Gifferson

A private, browser-based GIF maker. Images are decoded and encoded locally in the tab: there are no accounts, uploads, project history, or server-side files.

## Run locally

```sh
npm install
npm run dev
```

## Features

- Drag in PNG, JPEG, WebP, BMP, or animated GIF files.
- Preview, reorder, remove, and retime frames.
- Set frame timing, looping, output dimensions, quality, and image fit.
- Export above 800px with no artificial resolution cap.
- Detect the first imported frame's dimensions and apply them to the canvas automatically.
- Encode with Gifski WebAssembly inside a dedicated browser worker.

## Gifski

Web exports use the multithreaded `gifski-wasm` build, a WebAssembly wrapper around Gifski. It is distributed under AGPL-3.0-or-later; its license is included with the installed package. Cross-origin isolation headers enable the threaded encoder so high-resolution exports keep Gifski's cross-frame palettes and temporal dithering without reducing their dimensions.

The previous native macOS source is still present for reference while the web migration settles, but the primary product and development workflow are now web-based.
