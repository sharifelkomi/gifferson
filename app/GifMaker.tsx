"use client";

import {
  Clock3,
  Download,
  ImagePlus,
  Layers3,
  Lock,
  Pause,
  Play,
  Plus,
  Ratio,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const framesRef = useRef<GifFrame[]>([]);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

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
          <span className="brand-mark">G</span>
          <span>Gifferson</span>
        </a>

        <div className="stats" aria-label="Animation summary">
          <span><Layers3 size={13} /> {frames.length} {frames.length === 1 ? "frame" : "frames"}</span>
          <span><Ratio size={13} /> {width}×{height}</span>
          <span><Clock3 size={13} /> {durationLabel(totalDuration)}</span>
        </div>

        <div className="top-actions">
          <button className="button button--ghost" type="button" onClick={() => inputRef.current?.click()}>
            <Plus size={14} /> Add
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={!frames.length || isExporting}
            onClick={handleExport}
          >
            {isExporting ? <span className="spinner" /> : <Download size={14} />}
            {isExporting ? `${Math.round(progress * 100)}%` : "Export"}
          </button>
        </div>
      </header>

      <section
        className={`workspace${isDraggingOver ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDraggingOver(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="preview-stage">
          {selectedFrame ? (
            <div
              className="preview-canvas"
              style={{
                aspectRatio: `${width} / ${height}`,
                width: `min(90%, calc((100dvh - 340px) * ${width / Math.max(1, height)}))`,
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
            <div className="empty-state">
              <ImagePlus size={34} />
              <strong>{isImporting ? "Preparing your frames…" : "Drop images here"}</strong>
              <button type="button" onClick={() => inputRef.current?.click()}>
                <Upload size={14} /> Add Frames
              </button>
            </div>
          )}

          {isDraggingOver && (
            <div className="drop-overlay">
              <ImagePlus size={30} />
              <strong>Drop to add frames</strong>
            </div>
          )}

          <div className="playback">
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

        <div className="timeline-panel">
          <div className={`timeline${frames.length ? "" : " is-empty"}`} aria-label="GIF frame timeline">
            {frames.map((frame, index) => (
              <article
                key={frame.id}
                className={`frame-card${frame.id === selectedFrame?.id ? " is-selected" : ""}${draggingId === frame.id ? " is-dragging" : ""}`}
                style={{ flexBasis: Math.max(70, Math.round(112 * frame.width / Math.max(1, frame.height))) }}
                draggable
                onDragStart={() => setDraggingId(frame.id)}
                onDragEnd={() => setDraggingId(null)}
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
          <label className="compact-control">
            <span>Duration</span>
            <select value={defaultDuration} onChange={(event) => applyDefaultDuration(Number(event.target.value))}>
              {[0.1, 0.2, 0.3, 0.5, 1, 2, 5].map((duration) => (
                <option key={duration} value={duration}>{duration >= 1 ? `${duration}s` : `${duration.toFixed(1)}s`}</option>
              ))}
            </select>
          </label>

          <label className="compact-control">
            <span>Loop</span>
            <select value={loop} onChange={(event) => setLoop(event.target.value as LoopMode)}>
              <option value="forever">Infinite</option>
              <option value="once">Once</option>
              <option value="three">3x</option>
            </select>
          </label>

          <div className="compact-control size-control">
            <span>Size</span>
            <div>
              <input aria-label="Output width" type="number" min="1" max="8192" value={width} onChange={(event) => updateWidth(Number(event.target.value))} />
              <i>×</i>
              <input aria-label="Output height" type="number" min="1" max="8192" value={height} onChange={(event) => updateHeight(Number(event.target.value))} />
              <button type="button" onClick={toggleLock} aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                {locked ? <Lock size={11} fill="currentColor" /> : <Unlock size={11} />}
              </button>
            </div>
          </div>

          <label className="compact-control">
            <span>Fit</span>
            <select value={fit} onChange={(event) => setFit(event.target.value as FitMode)}>
              <option value="fill">Fill</option>
              <option value="fit">Fit</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>

          <label className="compact-control">
            <span>Quality</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value as QualityMode)}>
              <option value="best">Best</option>
              <option value="balanced">Balanced</option>
              <option value="compact">Compact</option>
            </select>
          </label>

          <div className="compact-control encoder-control">
            <span>Encoder</span>
            <b>Gifski</b>
          </div>

          <div className="settings-spacer" />
          <span className="privacy-compact"><ShieldCheck size={13} /> Local only</span>
          {frames.length > 0 && (
            <button className="clear-button" type="button" onClick={clearAll} title="Clear all frames">
              <Trash2 size={13} />
            </button>
          )}
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
