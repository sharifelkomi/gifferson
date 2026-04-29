# Gifferson

A native macOS GIF builder modeled after Figma's GIF maker, without the 800px export-size cap.

## Run

```sh
swift run Gifferson
```

## Build A Mac App

```sh
./scripts/build_app.sh
open "Build/Gifferson.app"
```

## Features

- Drag images into the timeline or use **Add Frames**.
- Preview frames with play, previous, and next controls.
- Set default frame duration, per-frame duration, loop mode, output width and height.
- Start from a 1920x1080 export size by default.
- Lock output aspect ratio while changing width or height.
- Choose fit behavior: fill, fit, or stretch.
- Choose encoder: fast Apple GIF export or high-quality Gifski export.
- Choose GIF quality: best, balanced, or compact.
- Export GIFs above 800px; output size is limited by available memory, not by an artificial 800px cap.

## Gifski Encoder

The Gifski encoder path uses the `gifski` command-line tool when it is available on the Mac. Install it with:

```sh
brew install gifski
```

Release builds made by `scripts/build_app.sh` bundle a pinned universal macOS `gifski` binary inside the app at `Contents/Resources/bin/gifski`. During development, the app also checks common Homebrew/MacPorts paths and `PATH`. You can set `GIFSKI_PATH` to the full executable path to override this.

`gifski` is distributed under AGPL-3.0-or-later unless you obtain a separate license from its author. The bundled license is copied into `Contents/Resources/licenses/gifski/`.
