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
  WheelEvent,
  useCallback,
  useEffect,
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
} from "./gif-utils";

const ACCEPTED_FILES = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const framesRef = useRef<GifFrame[]>([]);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const dragScrollSpeedRef = useRef(0);

  const toggleTheme = () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
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
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url));
    };
  }, []);

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
    const shouldApplyDetectedSize = framesRef.current.length === 0;
    setError(null);
    setIsImporting(true);

    try {
      const { decoded, rejected } = await decodeFiles(files);
      if (decoded.length) {
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
  }, [defaultDuration]);

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
    URL.revokeObjectURL(frame.url);
    const next = frames.filter((item) => item.id !== id);
    setFrames(next);
    if (selectedId === id) {
      setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
    }
    if (!next.length) setIsPlaying(false);
  };

  const clearAll = () => {
    frames.forEach((frame) => URL.revokeObjectURL(frame.url));
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
        <a className="brand" href="#top" aria-label="Gifferson home">
          <span>Gifferson</span>
        </a>

        <div className="stats" aria-label="Animation summary">
          <span>{frames.length} {frames.length === 1 ? "frame" : "frames"}</span>
          <span>{width} × {height}</span>
          <span>{durationLabel(totalDuration)}</span>
        </div>

        <div className="top-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label="Toggle color theme"
            title="Toggle color theme"
            onClick={toggleTheme}
          >
            <Moon className="theme-icon theme-icon--moon" size={15} aria-hidden="true" />
            <Sun className="theme-icon theme-icon--sun" size={15} aria-hidden="true" />
          </button>
          <button
            className="theme-toggle add-toggle"
            type="button"
            aria-label="Add frames"
            title="Add frames"
            onClick={() => inputRef.current?.click()}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          {frames.length > 0 && (
            <button
              className="theme-toggle delete-toggle"
              type="button"
              aria-label="Clear all frames"
              title="Clear all frames"
              onClick={clearAll}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          )}
          <button
            className="button button--primary"
            type="button"
            aria-label="Export GIF"
            title="Export GIF"
            disabled={!frames.length || isExporting}
            onClick={handleExport}
          >
            {isExporting ? <span className="spinner" /> : <Download size={14} />}
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
              aria-label="Choose images. Supported formats: PNG, JPG, WebP, BMP, or GIF"
              onClick={() => inputRef.current?.click()}
            >
              <span>{isImporting ? "Preparing images…" : "PNG, JPG, WebP, BMP, or GIF"}</span>
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
                <img src={frame.url} alt="" />
                <label className="duration-control" onClick={(event) => event.stopPropagation()}>
                  <input
                    aria-label={`Frame ${index + 1} duration in seconds`}
                    type="number"
                    min="0.02"
                    max="60"
                    step="0.01"
                    value={Number(frame.duration.toFixed(2))}
                    onChange={(event) => updateDuration(frame.id, Number(event.target.value))}
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
              </article>
            ))}

            <button className={`add-card${frames.length ? "" : " add-card--empty"}`} type="button" onClick={() => inputRef.current?.click()}>
              <Plus size={frames.length ? 21 : 16} />
              <span>{frames.length ? "" : "Add frames"}</span>
            </button>
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
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
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
                <option value="three">3x</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </span>
          </label>

          <div className="compact-control size-control">
            <span>Size</span>
            <div>
              <input aria-label="Output width" type="number" min="1" max="8192" value={width} onChange={(event) => updateWidth(Number(event.target.value))} />
              <i>×</i>
              <input aria-label="Output height" type="number" min="1" max="8192" value={height} onChange={(event) => updateHeight(Number(event.target.value))} />
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
        </div>
      </section>

      <input ref={inputRef} className="file-input" type="file" accept={ACCEPTED_FILES} multiple onChange={onFileChange} />

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}
    </main>
  );
}
