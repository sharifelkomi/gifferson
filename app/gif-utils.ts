import { decompressFrames, parseGIF } from "gifuct-js";

export type FitMode = "fill" | "fit" | "stretch";
export type LoopMode = "forever" | "once" | "three";
export type QualityMode = "best" | "balanced" | "compact";

export type GifFrame = {
  id: string;
  name: string;
  url: string;
  // A small copy for the timeline; the preview and export use `url`.
  thumbUrl: string;
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

// Timeline cards are 106px tall; twice that stays sharp on retina screens.
const THUMB_HEIGHT = 212;

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This image could not be prepared."));
    }, type, quality);
  });
}

export function revokeFrameUrls(frame: GifFrame) {
  URL.revokeObjectURL(frame.url);
  // Small images use the full image as their thumbnail.
  if (frame.thumbUrl !== frame.url) URL.revokeObjectURL(frame.thumbUrl);
}

// Browsers without WebP encoding hand back a PNG instead, which is fine here.
async function drawThumbnail(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  canvas.height = THUMB_HEIGHT;
  canvas.width = Math.max(1, Math.round((width * THUMB_HEIGHT) / height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create a thumbnail canvas.");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return URL.createObjectURL(await canvasToBlob(canvas, "image/webp", 0.85));
}

async function staticThumbnail(file: File, image: HTMLImageElement, url: string) {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (height <= THUMB_HEIGHT) return url;
  let bitmap: ImageBitmap | null = null;
  try {
    // Resizing while decoding avoids holding a second full-size copy.
    bitmap = await createImageBitmap(file, { resizeHeight: THUMB_HEIGHT, resizeQuality: "high" });
  } catch {
    // Fall back to drawing the already decoded image.
  }
  try {
    return await drawThumbnail(document.createElement("canvas"), bitmap ?? image, width, height);
  } catch {
    return url;
  } finally {
    bitmap?.close();
  }
}

async function decodeStaticImage(file: File): Promise<GifFrame[]> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return [
      {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, ""),
        url,
        thumbUrl: await staticThumbnail(file, image, url),
        width: image.naturalWidth,
        height: image.naturalHeight,
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

  const thumbCanvas = document.createElement("canvas");
  const needsThumbnail = canvas.height > THUMB_HEIGHT;
  const result: GifFrame[] = [];
  const baseName = file.name.replace(/\.[^.]+$/, "");

  try {
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

      const url = URL.createObjectURL(await canvasToBlob(canvas));
      const thumbUrl = needsThumbnail
        ? await drawThumbnail(thumbCanvas, canvas, canvas.width, canvas.height).catch(() => url)
        : url;
      result.push({
        id: uid(),
        name: `${baseName} ${index + 1}`,
        url,
        thumbUrl,
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
  } catch (error) {
    result.forEach(revokeFrameUrls);
    throw error;
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
  // Gifski's quality scale is nearly flat above ~80 (85 is only ~2% smaller
  // than 100), so the lighter presets sit lower to make a real difference.
  const gifskiQuality = quality === "best" ? 100 : quality === "balanced" ? 60 : 40;

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
        onProgress((nextFrame / frames.length) * 0.9);
        void sendNextFrame();
      } else if (message.type === "encoding") {
        onProgress(0.92);
      } else if (message.type === "complete" && message.buffer) {
        worker.terminate();
        resolve(new Blob([message.buffer], { type: "image/gif" }));
      } else if (message.type === "error") {
        // WASM traps (usually running out of memory) surface as bare
        // "unreachable" or "memory access out of bounds" messages.
        const isWasmTrap = /unreachable|out of bounds|memory/i.test(message.message ?? "");
        fail(new Error(isWasmTrap
          ? "This GIF is too big to make in the browser. Try a smaller size or fewer frames."
          : message.message || "GIF encoding failed."));
      }
    };

    worker.postMessage({
      type: "start",
      width,
      height,
      frameCount: frames.length,
      repeat,
      quality: gifskiQuality,
    });
  });
}
