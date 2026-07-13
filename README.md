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
- Perform all image processing in the browser using a dedicated worker.

The previous native macOS source is still present for reference while the web migration settles, but the primary product and development workflow are now web-based.
