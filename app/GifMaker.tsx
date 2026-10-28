"use client";

import {
  ChevronDown,
  Download,
  ImagePlus,
  Lock,
  Moon,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Sun,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  InputHTMLAttributes,
  WheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  decodeFiles,
  encodeGif,
  FitMode,
  GifFrame,
  LoopMode,
  QualityMode,
  revokeFrameUrls,
} from "./gif-utils";
import Wordmark from "./Wordmark";

const ACCEPTED_FILES = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
const UNDO_TIMEOUT = 8000;

type PendingClear = { frames: GifFrame[]; selectedId: string | null; clearedAt: number };

function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

// Path for a ring that sits `offset` px outside a rounded box. Each corner is the
// box's own corner curve (a superellipse; squircle or circle) pushed out along its
// normal, so the stroke's two edges and the gap stay exactly parallel. CSS can't
// do this: it draws the inner and outer edges as two separate superellipses.
function ringPath(width: number, height: number, radius: number, exponent: number, offset: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const steps = 48;
  const corners: [number, number, number, number, boolean][] = [
    [width - r, height - r, 1, 1, false],
    [r, height - r, -1, 1, true],
    [r, r, -1, -1, false],
    [width - r, r, 1, -1, true],
  ];
  const points: string[] = [];
  for (const [cx, cy, sx, sy, reverse] of corners) {
    for (let i = 0; i <= steps; i++) {
      const t = ((reverse ? steps - i : i) / steps) * (Math.PI / 2);
      const x = Math.cos(t) ** (2 / exponent);
      const y = Math.sin(t) ** (2 / exponent);
      const nx = x ** (exponent - 1);
      const ny = y ** (exponent - 1);
      const length = Math.hypot(nx, ny) || 1;
      points.push(
        `${(cx + sx * (r * x + (offset * nx) / length)).toFixed(2)} ${(cy + sy * (r * y + (offset * ny) / length)).toFixed(2)}`,
      );
    }
  }
  return `M${points.join("L")}Z`;
}

function SelectionRing() {
  const ref = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");

  useLayoutEffect(() => {
    const card = ref.current?.parentElement;
    if (!card) return;
    const update = () => {
      const style = getComputedStyle(card);
      const shape = style.getPropertyValue("corner-top-left-shape");
      const k = Number(/superellipse\(([-\d.]+)\)/.exec(shape)?.[1] ?? 1);
      const gap = parseFloat(style.getPropertyValue("--ring-gap")) || 2;
      const offset = gap + (parseFloat(style.getPropertyValue("--ring-width")) || 2) / 2;
      setPath(ringPath(card.offsetWidth, card.offsetHeight, parseFloat(style.borderTopLeftRadius) || 0, 2 ** k, offset));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <svg ref={ref} className="selection-ring" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function IconButton({
  label,
  disabled = false,
  primary = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-button${primary ? " icon-button--primary" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// A number field that keeps what's typed while it's being edited, so clearing
// it to type a new value doesn't snap to the minimum mid-edit. Only valid
// values are committed; on blur it shows the committed value again.
function NumberInput({
  value,
  min,
  onCommit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "min" | "onChange" | "onBlur" | "type"> & {
  value: number;
  min: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      min={min}
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const next = Number(text);
        if (text !== "" && Number.isFinite(next) && next >= min) onCommit(next);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export default function GifMaker() {
  const [frames, setFrames] = useState<GifFrame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [locked, setLocked] = useState(true);
  const [lockedRatio, setLockedRatio] = useState(16 / 9);
  const [fit, setFit] = useState<FitMode>("fill");
  const [loop, setLoop] = useState<LoopMode>("forever");
  const [quality, setQuality] = useState<QualityMode>("best");
  const [defaultDuration, setDefaultDuration] = useState(0.5);
  const [durationDraft, setDurationDraft] = useState("0.5");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewArea, setPreviewArea] = useState({ width: 0, height: 0 });
  const [pendingClear, setPendingClear] = useState<PendingClear | null>(null);
  // Mirrors pendingClear so cleanup paths see the stash without a render.
  const pendingClearRef = useRef<PendingClear | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const framesRef = useRef<GifFrame[]>([]);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const dragScrollSpeedRef = useRef(0);

  const toggleTheme = () => {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    // Without this every control tweens its colors at its own speed.
    root.classList.add("no-transitions");
    root.dataset.theme = nextTheme;
    void getComputedStyle(root).backgroundColor;
    root.classList.remove("no-transitions");
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = nextTheme === "dark" ? "#161514" : "#fbfaf9";
    });
    window.localStorage.setItem("gifferson-theme", nextTheme);
  };

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.max(0, entry.contentRect.width),
        height: Math.max(0, entry.contentRect.height),
      };
      setPreviewArea((current) => (
        Math.abs(current.width - next.width) < 1 && Math.abs(current.height - next.height) < 1
          ? current
          : next
      ));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      framesRef.current.forEach(revokeFrameUrls);
      pendingClearRef.current?.frames.forEach(revokeFrameUrls);
    };
  }, []);

  const dismissUndo = useCallback(() => {
    pendingClearRef.current = null;
    setPendingClear(null);
  }, []);

  // Cleared frames keep their object URLs until the undo window closes.
  const finalizeClear = useCallback(() => {
    const pending = pendingClearRef.current;
    if (!pending) return;
    pending.frames.forEach(revokeFrameUrls);
    dismissUndo();
  }, [dismissUndo]);

  const undoClear = useCallback(() => {
    const pending = pendingClearRef.current;
    if (!pending) return;
    dismissUndo();
    setFrames(pending.frames);
    setSelectedId(pending.selectedId);
  }, [dismissUndo]);

  useEffect(() => {
    if (!pendingClear) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z") return;
      // Fields keep their own native undo.
      if (event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]")) return;
      event.preventDefault();
      undoClear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingClear, undoClear]);

  const selectedIndex = useMemo(() => {
    const index = frames.findIndex((frame) => frame.id === selectedId);
    return index >= 0 ? index : frames.length ? 0 : -1;
  }, [frames, selectedId]);
  const selectedFrame = selectedIndex >= 0 ? frames[selectedIndex] : null;
  const totalDuration = frames.reduce((sum, frame) => sum + frame.duration, 0);
  const previewDimensions = useMemo(() => {
    if (!previewArea.width || !previewArea.height) return null;
    const ratio = width / Math.max(1, height);
    const availableWidth = previewArea.width * 0.96;
    const availableHeight = previewArea.height * 0.96;
    if (availableWidth / availableHeight > ratio) {
      return { width: Math.floor(availableHeight * ratio), height: Math.floor(availableHeight) };
    }
    return { width: Math.floor(availableWidth), height: Math.floor(availableWidth / ratio) };
  }, [height, previewArea, width]);

  const importFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    finalizeClear();
    const shouldApplyDetectedSize = framesRef.current.length === 0;
    setError(null);
    setIsImporting(true);

    try {
      const { decoded, rejected } = await decodeFiles(files);
      if (decoded.length) {
        // An import that started before a clear would otherwise be lost on undo.
        finalizeClear();
        const nextFrames = decoded.map((frame) => ({
          ...frame,
          duration: frame.duration === 0.5 ? defaultDuration : frame.duration,
        }));
        setFrames((current) => [...current, ...nextFrames]);
        setSelectedId((current) => current ?? nextFrames[0].id);
        if (shouldApplyDetectedSize) {
          const detectedWidth = nextFrames[0].width;
          const detectedHeight = nextFrames[0].height;
          setWidth(detectedWidth);
          setHeight(detectedHeight);
          setLockedRatio(detectedWidth / Math.max(1, detectedHeight));
        }
      }
      if (rejected.length) {
        setError(
          `Couldn’t read ${rejected.slice(0, 2).join(", ")}${rejected.length > 2 ? " and more" : ""}. Try PNG, JPG, WebP, BMP, or GIF.`,
        );
      }
    } finally {
      setIsImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [defaultDuration, finalizeClear]);

  useEffect(() => {
    if (!isPlaying || !selectedFrame) return;
    const timer = window.setTimeout(() => {
      if (selectedIndex === frames.length - 1 && loop === "once") {
        setIsPlaying(false);
        return;
      }
      const next = (selectedIndex + 1) % frames.length;
      setSelectedId(frames[next].id);
    }, Math.max(20, selectedFrame.duration * 1000));
    return () => window.clearTimeout(timer);
  }, [frames, isPlaying, loop, selectedFrame, selectedIndex]);

  const selectPrevious = () => {
    if (!frames.length) return;
    const previous = selectedIndex <= 0 ? frames.length - 1 : selectedIndex - 1;
    setSelectedId(frames[previous].id);
  };

  const selectNext = () => {
    if (!frames.length) return;
    setSelectedId(frames[(selectedIndex + 1) % frames.length].id);
  };

  const removeFrame = (id: string) => {
    const index = frames.findIndex((frame) => frame.id === id);
    const frame = frames[index];
    if (!frame) return;
    revokeFrameUrls(frame);
    const next = frames.filter((item) => item.id !== id);
    setFrames(next);
    if (selectedId === id) {
      setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
    }
    if (!next.length) setIsPlaying(false);
  };

  const clearAll = () => {
    if (!frames.length) return;
    finalizeClear();
    const pending = { frames, selectedId, clearedAt: Date.now() };
    pendingClearRef.current = pending;
    setPendingClear(pending);
    setFrames([]);
    setSelectedId(null);
    setIsPlaying(false);
  };

  const updateDuration = (id: string, duration: number) => {
    setFrames((current) => current.map((frame) =>
      frame.id === id ? { ...frame, duration: Math.max(0.02, duration) } : frame,
    ));
  };

  const applyDefaultDuration = (duration: number) => {
    const safeDuration = Math.max(0.02, duration || 0.02);
    setDefaultDuration(safeDuration);
    setFrames((current) => current.map((frame) => ({ ...frame, duration: safeDuration })));
  };

  const updateDurationDraft = (value: string) => {
    setDurationDraft(value);
    const duration = Number(value);
    if (value !== "" && Number.isFinite(duration) && duration >= 0.02) {
      applyDefaultDuration(duration);
    }
  };

  const commitDurationDraft = () => {
    const duration = Number(durationDraft);
    const safeDuration = Number.isFinite(duration) ? Math.max(0.02, duration) : defaultDuration;
    setDurationDraft(String(safeDuration));
    applyDefaultDuration(safeDuration);
  };

  const updateWidth = (nextWidth: number) => {
    const safeWidth = Math.max(1, Math.round(nextWidth || 1));
    setWidth(safeWidth);
    if (locked) setHeight(Math.max(1, Math.round(safeWidth / lockedRatio)));
  };

  const updateHeight = (nextHeight: number) => {
    const safeHeight = Math.max(1, Math.round(nextHeight || 1));
    setHeight(safeHeight);
    if (locked) setWidth(Math.max(1, Math.round(safeHeight * lockedRatio)));
  };

  const toggleLock = () => {
    if (!locked) setLockedRatio(width / Math.max(1, height));
    setLocked((current) => !current);
  };

  const reorder = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setFrames((current) => {
      const from = current.findIndex((frame) => frame.id === draggingId);
      const to = current.findIndex((frame) => frame.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    });
  };

  const stopTimelineAutoScroll = useCallback(() => {
    dragScrollSpeedRef.current = 0;
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
  }, []);

  const updateTimelineAutoScroll = (event: DragEvent<HTMLElement>) => {
    const timeline = timelineRef.current;
    if (!timeline || !draggingId || timeline.scrollWidth <= timeline.clientWidth) {
      stopTimelineAutoScroll();
      return;
    }

    const bounds = timeline.getBoundingClientRect();
    const edgeSize = Math.min(96, Math.max(52, bounds.width * 0.16));
    let speed = 0;
    if (event.clientX < bounds.left + edgeSize) {
      const intensity = Math.min(1, (bounds.left + edgeSize - event.clientX) / edgeSize);
      speed = -(3 + intensity * 15);
    } else if (event.clientX > bounds.right - edgeSize) {
      const intensity = Math.min(1, (event.clientX - (bounds.right - edgeSize)) / edgeSize);
      speed = 3 + intensity * 15;
    }

    dragScrollSpeedRef.current = speed;
    if (!speed || dragScrollFrameRef.current !== null) return;

    const scroll = () => {
      const activeTimeline = timelineRef.current;
      if (!activeTimeline || !dragScrollSpeedRef.current) {
        dragScrollFrameRef.current = null;
        return;
      }
      activeTimeline.scrollLeft += dragScrollSpeedRef.current;
      dragScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };
    dragScrollFrameRef.current = window.requestAnimationFrame(scroll);
  };

  const handleTimelineWheel = (event: WheelEvent<HTMLDivElement>) => {
    const timeline = event.currentTarget;
    if (timeline.scrollWidth <= timeline.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const atStart = timeline.scrollLeft <= 0 && event.deltaY < 0;
    const atEnd = timeline.scrollLeft + timeline.clientWidth >= timeline.scrollWidth - 1 && event.deltaY > 0;
    if (atStart || atEnd) return;
    event.preventDefault();
    timeline.scrollLeft += event.deltaY;
  };

  useEffect(() => stopTimelineAutoScroll, [stopTimelineAutoScroll]);

  const handleExport = async () => {
    if (!frames.length || isExporting) return;
    setError(null);
    setIsExporting(true);
    setProgress(0);

    try {
      const blob = await encodeGif({
        frames,
        width,
        height,
        fit,
        loop,
        quality,
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gifferson-animation.gif";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      // Bump the all-time export count. It must never affect the export.
      void fetch("/api/exports", { method: "POST", keepalive: true }).catch(() => {});
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "GIF export failed.");
    } finally {
      setIsExporting(false);
      setProgress(0);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void importFiles(event.target.files);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    void importFiles(event.dataTransfer.files);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1 className="brand">
          <Wordmark className="brand__mark" aria-hidden="true" />
          <span className="sr-only">Gifferson</span>
        </h1>

        <div className="stats" aria-label="Animation summary">
          <span>{frames.length} {frames.length === 1 ? "frame" : "frames"}</span>
          <span>{width} × {height}</span>
          <span>{durationLabel(totalDuration)}</span>
        </div>

        <div className="top-actions">
          <button
            className="theme-toggle theme-toggle--raised"
            type="button"
            aria-label="Toggle color theme"
            title="Toggle color theme"
            onClick={toggleTheme}
          >
            <Moon className="theme-icon theme-icon--moon" size={15} aria-hidden="true" />
            <Sun className="theme-icon theme-icon--sun" size={15} aria-hidden="true" />
          </button>
          {/* For a few seconds after clearing, this button becomes Undo; the
              ring empties as the window closes, and finalizes when it ends. */}
          <button
            className={`button button--secondary${pendingClear ? "" : " button--danger"}`}
            type="button"
            aria-label={pendingClear ? "Undo clear all" : "Clear all frames"}
            title={pendingClear ? "Undo clear all" : "Clear all frames"}
            disabled={!frames.length && !pendingClear}
            onClick={pendingClear ? undoClear : clearAll}
          >
            {pendingClear ? (
              <svg key={pendingClear.clearedAt} className="countdown" viewBox="0 0 16 16" aria-hidden="true">
                <circle className="countdown__track" cx="8" cy="8" r="6" />
                <circle
                  className="countdown__bar"
                  cx="8"
                  cy="8"
                  r="6"
                  pathLength={1}
                  style={{ animationDuration: `${UNDO_TIMEOUT}ms` }}
                  onAnimationEnd={finalizeClear}
                />
              </svg>
            ) : (
              <Trash2 size={14} aria-hidden="true" />
            )}
            {pendingClear ? "Undo" : "Clear all"}
          </button>
          <button
            className="button button--primary"
            type="button"
            aria-label={isExporting ? `Exporting GIF, ${Math.round(progress * 100)}%` : "Export GIF"}
            title="Export GIF"
            disabled={!frames.length || isExporting}
            onClick={handleExport}
          >
            {isExporting ? <span className="spinner" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            {isExporting ? `${Math.round(progress * 100)}%` : "Export GIF"}
          </button>
        </div>
      </header>

      <section
        className={`workspace${isDraggingOver ? " is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (draggingId) updateTimelineAutoScroll(event);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="preview-stage" ref={previewStageRef}>
          {selectedFrame ? (
            <div
              className="preview-canvas"
              style={{
                aspectRatio: `${width} / ${height}`,
                ...(previewDimensions ?? {}),
              }}
            >
              {/* User-selected blob URL; it never leaves this browser tab. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedFrame.url}
                alt={`Preview of ${selectedFrame.name}`}
                style={{ objectFit: fit === "stretch" ? "fill" : fit === "fill" ? "cover" : "contain" }}
              />
            </div>
          ) : (
            <button
              className="empty-state"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <strong>{isImporting ? "Preparing images…" : "Drop images here or click to choose"}</strong>
              <span>PNG, JPG, WebP, BMP, or GIF</span>
              {!isImporting && <span className="empty-state__cta">Choose images</span>}
            </button>
          )}

          {isDraggingOver && (
            <div className="drop-overlay">
              <ImagePlus size={30} />
              <strong>Drop to add images</strong>
            </div>
          )}

        </div>

        <div className="timeline-panel">
          <div
            ref={timelineRef}
            className={`timeline${frames.length ? "" : " is-empty"}`}
            aria-label="GIF frame timeline"
            role="region"
            tabIndex={0}
            onWheel={handleTimelineWheel}
          >
            {frames.map((frame, index) => (
              <article
                key={frame.id}
                className={`frame-card${frame.id === selectedFrame?.id ? " is-selected" : ""}${draggingId === frame.id ? " is-dragging" : ""}`}
                style={{ flexBasis: Math.max(70, Math.round(106 * frame.width / Math.max(1, frame.height))) }}
                aria-current={frame.id === selectedFrame?.id ? "true" : undefined}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(frame.id);
                }}
                onDragEnd={() => {
                  stopTimelineAutoScroll();
                  setDraggingId(null);
                }}
                onDragOver={(event) => { event.preventDefault(); reorder(frame.id); }}
                onClick={() => setSelectedId(frame.id)}
                aria-label={`Frame ${index + 1}: ${frame.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame.thumbUrl} alt="" loading="lazy" decoding="async" />
                <label className="duration-control" onClick={(event) => event.stopPropagation()}>
                  <NumberInput
                    aria-label={`Frame ${index + 1} duration in seconds`}
                    inputMode="decimal"
                    enterKeyHint="done"
                    min={0.02}
                    max="60"
                    step="0.01"
                    value={Number(frame.duration.toFixed(2))}
                    onCommit={(duration) => updateDuration(frame.id, duration)}
                  />
                  <span>s</span>
                </label>
                <button
                  type="button"
                  className="frame-delete"
                  aria-label={`Delete frame ${index + 1}`}
                  onClick={(event) => { event.stopPropagation(); removeFrame(frame.id); }}
                >
                  <Trash2 size={13} fill="currentColor" />
                </button>
                {frame.id === selectedFrame?.id && <SelectionRing />}
              </article>
            ))}

            {frames.length ? (
              <button
                className="add-card"
                type="button"
                aria-label={isImporting ? "Adding frames" : "Add frames"}
                onClick={() => inputRef.current?.click()}
              >
                {isImporting ? <span className="spinner" aria-hidden="true" /> : <Plus size={21} aria-hidden="true" />}
              </button>
            ) : (
              <p className="timeline-placeholder">Your frames will appear here</p>
            )}
          </div>
        </div>

        <div className="settings-strip">
          <div className="compact-control playback-control">
            <span>Playback</span>
            <div className="playback" aria-label="Playback controls">
              <IconButton label="Previous frame" disabled={!frames.length} onClick={selectPrevious}>
                <SkipBack size={15} fill="currentColor" />
              </IconButton>
              <IconButton
                label={isPlaying ? "Pause preview" : "Play preview"}
                disabled={!frames.length}
                primary
                onClick={() => setIsPlaying((current) => !current)}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play className="play-icon" size={16} fill="currentColor" />}
              </IconButton>
              <IconButton label="Next frame" disabled={!frames.length} onClick={selectNext}>
                <SkipForward size={15} fill="currentColor" />
              </IconButton>
              <span className="playback-count">
                {selectedIndex >= 0 ? selectedIndex + 1 : 0} / {frames.length}
              </span>
            </div>
          </div>

          <label className="compact-control">
            <span>Duration</span>
            <span className="number-field">
              <input
                aria-label="Default frame duration in seconds"
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                min="0.02"
                step="0.01"
                value={durationDraft}
                onChange={(event) => updateDurationDraft(event.target.value)}
                onBlur={commitDurationDraft}
              />
              <i>s</i>
            </span>
          </label>

          <label className="compact-control">
            <span>Loop</span>
            <span className="select-field">
              <select value={loop} onChange={(event) => setLoop(event.target.value as LoopMode)}>
                <option value="forever">Infinite</option>
                <option value="once">Once</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </span>
          </label>

          <div className="compact-control size-control">
            <span>Size</span>
            <div>
              <NumberInput aria-label="Output width" inputMode="numeric" enterKeyHint="done" min={1} max="8192" value={width} onCommit={updateWidth} />
              <i>×</i>
              <NumberInput aria-label="Output height" inputMode="numeric" enterKeyHint="done" min={1} max="8192" value={height} onCommit={updateHeight} />
              <button type="button" onClick={toggleLock} aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                {locked ? <Lock size={11} /> : <Unlock size={11} />}
              </button>
            </div>
          </div>

          <label className="compact-control">
            <span>Fit</span>
            <span className="select-field">
              <select value={fit} onChange={(event) => setFit(event.target.value as FitMode)}>
                <option value="fill">Fill</option>
                <option value="fit">Fit</option>
                <option value="stretch">Stretch</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </span>
          </label>

          <label className="compact-control">
            <span>Quality</span>
            <span className="select-field">
              <select value={quality} onChange={(event) => setQuality(event.target.value as QualityMode)}>
                <option value="best">Best</option>
                <option value="balanced">Balanced</option>
                <option value="compact">Compact</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </span>
          </label>

          <p className="credits">
            <span>
              Encoded with <a href="https://gif.ski" target="_blank" rel="noreferrer">Gifski</a> via{" "}
              <a href="https://github.com/jamsinclair/gifski-wasm" target="_blank" rel="noreferrer">gifski-wasm</a>{" "}
              (<a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">AGPL-3.0</a>).
            </span>{" "}
            <span>
              <a href="https://github.com/sharifelkomi/gifferson" target="_blank" rel="noreferrer">Source</a>. Built by{" "}
              <a href="https://sharifelkomi.com" target="_blank" rel="noopener">Sharif</a>.
            </span>
          </p>
        </div>
      </section>

      <p className="sr-only" role="status">
        {isImporting
          ? "Adding frames…"
          : isExporting
            ? "Exporting GIF…"
            : pendingClear
              ? `Cleared ${pendingClear.frames.length} ${pendingClear.frames.length === 1 ? "frame" : "frames"}. Press Undo to restore.`
              : ""}
      </p>

      <input ref={inputRef} className="file-input" type="file" accept={ACCEPTED_FILES} multiple onChange={onFileChange} />

      {error && (
        <div className="toasts">
          <div className="toast" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button>
          </div>
        </div>
      )}
    </main>
  );
}
