/// <reference lib="webworker" />

import gifskiEncode from "gifski-wasm";

type StartMessage = {
  type: "start";
  width: number;
  height: number;
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

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === "start") {
      width = message.width;
      height = message.height;
      repeat = message.repeat;
      quality = message.quality;
      frames = [];
      frameDurations = [];
      self.postMessage({ type: "ready" });
      return;
    }

    if (message.type === "frame") {
      frames.push(new Uint8Array(message.rgba));
      frameDurations.push(message.delay);
      self.postMessage({ type: "frame-done", index: message.index });
      return;
    }

    if (!frames.length) throw new Error("Add at least one frame before exporting.");

    // The WASM wrapper requires an animation. Duplicating a lone frame keeps
    // single-image exports visually static while still using Gifski.
    if (frames.length === 1) {
      const duration = Math.max(20, frameDurations[0]);
      frames.push(frames[0]);
      frameDurations = [Math.max(20, Math.round(duration / 2)), Math.max(20, Math.round(duration / 2))];
    }

    self.postMessage({ type: "encoding" });
    const bytes = await gifskiEncode({
      frames,
      width,
      height,
      frameDurations,
      quality,
      repeat,
    });
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
