/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize } from "gifenc";

type StartMessage = {
  type: "start";
  width: number;
  height: number;
  repeat: number;
  colors: number;
};

type FrameMessage = {
  type: "frame";
  rgba: ArrayBuffer;
  delay: number;
  index: number;
};

type FinishMessage = { type: "finish" };
type WorkerMessage = StartMessage | FrameMessage | FinishMessage;

let encoder: ReturnType<typeof GIFEncoder> | null = null;
let width = 0;
let height = 0;
let repeat = 0;
let colors = 256;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    if (message.type === "start") {
      encoder = GIFEncoder();
      width = message.width;
      height = message.height;
      repeat = message.repeat;
      colors = message.colors;
      self.postMessage({ type: "ready" });
      return;
    }

    if (message.type === "frame") {
      if (!encoder) throw new Error("The encoder was not initialized.");
      const rgba = new Uint8ClampedArray(message.rgba);
      const palette = quantize(rgba, colors, { format: "rgb565" });
      const indexed = applyPalette(rgba, palette, "rgb565");
      encoder.writeFrame(indexed, width, height, {
        palette,
        delay: message.delay,
        repeat,
      });
      self.postMessage({ type: "frame-done", index: message.index });
      return;
    }

    if (!encoder) throw new Error("The encoder was not initialized.");
    encoder.finish();
    const bytes = encoder.bytes();
    encoder = null;
    self.postMessage({ type: "complete", buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "GIF encoding failed.",
    });
  }
};

export {};
