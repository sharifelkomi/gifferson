import { decompressFrames, parseGIF } from "gifuct-js";

export type FitMode = "fill" | "fit" | "stretch";
export type LoopMode = "forever" | "once" | "three";
export type QualityMode = "best" | "balanced" | "compact";

export type GifFrame = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number;
};

const acceptedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This image could not be prepared."));
    }, type);
  });
}

async function imageDimensions(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
}

async function decodeStaticImage(file: File): Promise<GifFrame[]> {
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await imageDimensions(url);
    return [
      {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, ""),
        url,
        ...dimensions,
        duration: 0.5,
      },
    ];
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decodeAnimatedGif(file: File): Promise<GifFrame[]> {
  const parsed = parseGIF(await file.arrayBuffer());
  const sourceFrames = decompressFrames(parsed, true);
  if (!sourceFrames.length) throw new Error(`${file.name} has no readable frames.`);

  const canvas = document.createElement("canvas");
  canvas.width = parsed.lsd.width;
  canvas.height = parsed.lsd.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not create an image canvas.");

  const patchCanvas = document.createElement("canvas");
  const patchContext = patchCanvas.getContext("2d");
  if (!patchContext) throw new Error("Your browser could not decode this GIF.");

  const result: GifFrame[] = [];
  const baseName = file.name.replace(/\.[^.]+$/, "");

  for (let index = 0; index < sourceFrames.length; index += 1) {
    const frame = sourceFrames[index];
    const before = frame.disposalType === 3
      ? context.getImageData(0, 0, canvas.width, canvas.height)
      : null;

    patchCanvas.width = frame.dims.width;
    patchCanvas.height = frame.dims.height;
    patchContext.putImageData(
      new ImageData(
        new Uint8ClampedArray(frame.patch),
        frame.dims.width,
        frame.dims.height,
      ),
      0,
      0,
    );
    context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

    const blob = await canvasToBlob(canvas);
    result.push({
      id: uid(),
      name: `${baseName} ${index + 1}`,
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
      duration: Math.max(0.02, (frame.delay || 100) / 1000),
    });

    if (frame.disposalType === 2) {
      context.clearRect(
        frame.dims.left,
        frame.dims.top,
        frame.dims.width,
        frame.dims.height,
      );
    } else if (frame.disposalType === 3 && before) {
      context.putImageData(before, 0, 0);
    }
  }

  return result;
}

export async function decodeFiles(files: File[]) {
  const decoded: GifFrame[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    if (!acceptedTypes.has(file.type) && !isGif) {
      rejected.push(file.name);
      continue;
    }

    try {
      decoded.push(...(isGif ? await decodeAnimatedGif(file) : await decodeStaticImage(file)));
    } catch {
      rejected.push(file.name);
    }
  }

  return { decoded, rejected };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A source frame could not be read."));
    image.src = url;
  });
}

function drawFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fit: FitMode,
) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (fit === "stretch") {
    context.drawImage(image, 0, 0, width, height);
    return;
  }

  const scale = fit === "fill"
    ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
    : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

type ExportOptions = {
  frames: GifFrame[];
  width: number;
  height: number;
  fit: FitMode;
  loop: LoopMode;
  quality: QualityMode;
  onProgress: (progress: number) => void;
};

export async function encodeGif(options: ExportOptions): Promise<Blob> {
  const { frames, width, height, fit, loop, quality, onProgress } = options;
  if (!frames.length) throw new Error("Add at least one frame first.");
  if (width < 1 || height < 1) throw new Error("Choose a valid export size.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not create the export canvas.");

  const worker = new Worker(new URL("./gif-worker.ts", import.meta.url), {
    type: "module",
  });
  const repeat = loop === "forever" ? 0 : loop === "once" ? -1 : 3;
  const colors = quality === "best" ? 256 : quality === "balanced" ? 128 : 64;

  return new Promise<Blob>((resolve, reject) => {
    let nextFrame = 0;

    const fail = (error: unknown) => {
      worker.terminate();
      reject(error instanceof Error ? error : new Error("GIF encoding failed."));
    };

    const sendNextFrame = async () => {
      try {
        if (nextFrame >= frames.length) {
          worker.postMessage({ type: "finish" });
          return;
        }

        const frame = frames[nextFrame];
        const image = await loadImage(frame.url);
        drawFrame(context, image, width, height, fit);
        const rgba = context.getImageData(0, 0, width, height).data;
        worker.postMessage(
          {
            type: "frame",
            rgba: rgba.buffer,
            delay: Math.round(Math.max(0.02, frame.duration) * 1000),
            index: nextFrame,
          },
          [rgba.buffer],
        );
      } catch (error) {
        fail(error);
      }
    };

    worker.onerror = () => fail(new Error("The browser encoder stopped unexpectedly."));
    worker.onmessage = (event) => {
      const message = event.data as {
        type: string;
        index?: number;
        buffer?: ArrayBuffer;
        message?: string;
      };

      if (message.type === "ready") {
        void sendNextFrame();
      } else if (message.type === "frame-done") {
        nextFrame = (message.index ?? nextFrame) + 1;
        onProgress(nextFrame / frames.length);
        void sendNextFrame();
      } else if (message.type === "complete" && message.buffer) {
        worker.terminate();
        resolve(new Blob([message.buffer], { type: "image/gif" }));
      } else if (message.type === "error") {
        fail(new Error(message.message || "GIF encoding failed."));
      }
    };

    worker.postMessage({ type: "start", width, height, repeat, colors });
  });
}
