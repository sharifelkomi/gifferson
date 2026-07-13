/// <reference lib="webworker" />

import gifskiEncode from "gifski-wasm";
import { applyPalette, GIFEncoder, quantize } from "gifenc";

// The current Gifski WASM build traps when its full-resolution frame buffer
// grows much beyond this point. Keep Gifski as the primary path, and use the
// exact-size streaming encoder above the safe browser workload.
const MAX_GIFSKI_TOTAL_PIXELS = 10_000_000;

type StartMessage = {
  type: "start";
  width: number;
  height: number;
  frameCount: number;
  repeat: number;
  quality: number;
};

type FrameMessage = {
  type: "frame";
  rgba: ArrayBuffer;
  delay: number;
  index: number;
};

type FinishMessage = { type: "finish" };
type WorkerMessage = StartMessage | FrameMessage | FinishMessage;

let width = 0;
let height = 0;
let repeat = 0;
let quality = 100;
let frames: Uint8Array[] = [];
let frameDurations: number[] = [];
let sourceFrameCount = 0;
let usesGifski = true;
let exactEncoder: ReturnType<typeof GIFEncoder> | null = null;

function writeExactFrame(frame: Uint8Array, delay: number) {
  if (!exactEncoder) throw new Error("The exact-size encoder was not initialized.");
  const maxColors = quality >= 95 ? 256 : quality >= 80 ? 128 : 64;
  const palette = quantize(frame, maxColors, { format: "rgb565" });
  const indexed = applyPalette(frame, palette, "rgb565");
  exactEncoder.writeFrame(indexed, width, height, {
    palette,
    delay,
    repeat,
  });
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === "start") {
      width = message.width;
      height = message.height;
      sourceFrameCount = message.frameCount;
      repeat = message.repeat;
      quality = message.quality;
      usesGifski = width * height * Math.max(2, sourceFrameCount) <= MAX_GIFSKI_TOTAL_PIXELS;
      frames = [];
      frameDurations = [];
      exactEncoder = usesGifski ? null : GIFEncoder();
      self.postMessage({ type: "ready" });
      return;
    }

    if (message.type === "frame") {
      const frame = new Uint8Array(message.rgba);
      if (usesGifski) {
        frames.push(frame);
        frameDurations.push(message.delay);
      } else if (sourceFrameCount === 1) {
        const halfDelay = Math.max(20, Math.round(message.delay / 2));
        writeExactFrame(frame, halfDelay);
        writeExactFrame(frame, halfDelay);
      } else {
        writeExactFrame(frame, message.delay);
      }
      self.postMessage({ type: "frame-done", index: message.index });
      return;
    }

    if (sourceFrameCount < 1) throw new Error("Add at least one frame before exporting.");

    // The WASM wrapper requires an animation. Duplicating a lone frame keeps
    // single-image exports visually static while still using Gifski.
    if (usesGifski && frames.length === 1) {
      const duration = Math.max(20, frameDurations[0]);
      frames.push(frames[0]);
      frameDurations = [Math.max(20, Math.round(duration / 2)), Math.max(20, Math.round(duration / 2))];
    }

    self.postMessage({ type: "encoding", encoder: usesGifski ? "gifski" : "exact" });
    let bytes: Uint8Array;
    if (usesGifski) {
      bytes = await gifskiEncode({
          frames,
          width,
          height,
          // Gifski otherwise applies its own large-frame downscaling.
          resizeWidth: width,
          resizeHeight: height,
          frameDurations,
          quality,
          repeat,
        });
    } else {
      if (!exactEncoder) throw new Error("The exact-size encoder was not initialized.");
      exactEncoder.finish();
      bytes = exactEncoder.bytes();
      exactEncoder = null;
    }
    frames = [];
    frameDurations = [];
    self.postMessage({ type: "complete", buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "GIF encoding failed.",
    });
  }
};

export {};
