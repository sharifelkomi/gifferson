/// <reference lib="webworker" />

import gifskiEncode from "gifski-wasm/multi-thread";

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

// The multi-threaded Gifski build has a 1 GB memory cap and receives every
// frame at once. Past roughly 40M pixels its threads run out of memory and
// deadlock instead of throwing, so frames are encoded in batches that stay
// well under that and the batches are stitched into one GIF.
const BATCH_PIXEL_BUDGET = 16_000_000;

let width = 0;
let height = 0;
let repeat = 0;
let quality = 100;
let frames: Uint8Array[] = [];
let frameDurations: number[] = [];
let sourceFrameCount = 0;
let receivedCount = 0;
let batches: Uint8Array[] = [];

async function encodeBatch() {
  // The WASM wrapper requires an animation. Duplicating a lone frame keeps
  // single-image exports visually static while still using Gifski.
  if (frames.length === 1) {
    const duration = Math.max(20, frameDurations[0]);
    frames.push(frames[0]);
    frameDurations = [Math.max(20, Math.round(duration / 2)), Math.max(20, Math.round(duration / 2))];
  }

  const bytes = await gifskiEncode({
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
  frames = [];
  frameDurations = [];
  batches.push(bytes);
}

function skipSubBlocks(gif: Uint8Array, offset: number) {
  while (gif[offset] !== 0) offset += gif[offset] + 1;
  return offset + 1;
}

// Joins GIFs of the same size into one animation. The first GIF supplies the
// header, global palette and loop extension; later GIFs contribute only their
// frames, with their global palette copied into any frame that relied on it.
function concatGifs(gifs: Uint8Array[]) {
  if (gifs.length === 1) return gifs[0];
  const parts: Uint8Array[] = [];

  gifs.forEach((gif, gifIndex) => {
    const packed = gif[10];
    const globalTableSize = packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
    const globalTable = gif.subarray(13, 13 + globalTableSize);
    let offset = 13 + globalTableSize;
    if (gifIndex === 0) parts.push(gif.subarray(0, offset));

    while (offset < gif.length && gif[offset] !== 0x3b) {
      const start = offset;
      if (gif[offset] === 0x21) {
        const label = gif[offset + 1];
        offset = skipSubBlocks(gif, offset + 2);
        // Graphic control extensions carry frame timing and disposal; the rest
        // (loop count, comments) only belongs once, in the first GIF.
        if (gifIndex === 0 || label === 0xf9) parts.push(gif.subarray(start, offset));
      } else if (gif[offset] === 0x2c) {
        const imagePacked = gif[offset + 9];
        const localTableSize = imagePacked & 0x80 ? 3 * 2 ** ((imagePacked & 0x07) + 1) : 0;
        offset = skipSubBlocks(gif, offset + 10 + localTableSize + 1);
        if (gifIndex > 0 && !localTableSize && globalTableSize) {
          const descriptor = gif.slice(start, start + 10);
          descriptor[9] = (imagePacked & 0x78) | 0x80 | (packed & 0x07);
          parts.push(descriptor, globalTable, gif.subarray(start + 10, offset));
        } else {
          parts.push(gif.subarray(start, offset));
        }
      } else {
        throw new Error("The encoder produced an unreadable GIF.");
      }
    }
  });

  parts.push(new Uint8Array([0x3b]));
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
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
      frames = [];
      frameDurations = [];
      receivedCount = 0;
      batches = [];
      self.postMessage({ type: "ready" });
      return;
    }

    if (message.type === "frame") {
      frames.push(new Uint8Array(message.rgba));
      frameDurations.push(message.delay);
      receivedCount += 1;
      // Never leave a single frame for the last batch, since Gifski needs two.
      const remaining = sourceFrameCount - receivedCount;
      if (frames.length * width * height >= BATCH_PIXEL_BUDGET && frames.length > 1 && remaining !== 1) {
        await encodeBatch();
      }
      self.postMessage({ type: "frame-done", index: message.index });
      return;
    }

    if (sourceFrameCount < 1) throw new Error("Add at least one frame before exporting.");

    self.postMessage({ type: "encoding", encoder: "gifski" });
    if (frames.length) await encodeBatch();
    const bytes = concatGifs(batches);
    batches = [];
    self.postMessage({ type: "complete", buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "GIF encoding failed.",
    });
  }
};

export {};
