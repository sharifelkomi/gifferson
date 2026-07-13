"use client";

import {
  Check,
  Clock3,
  Download,
  GripVertical,
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
  Sparkles,
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

function secondsLabel(value: number) {
  if (value < 1) return `${Math.round(value * 1000)}ms`;
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`;
}

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

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && <Check size={13} strokeWidth={3} />}
          {option.label}
        </button>
      ))}
    </div>
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
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>Gifferson</span>
          <span className="beta">WEB</span>
        </a>

        <div className="stats" aria-label="Animation summary">
          <span><Layers3 size={15} /> {frames.length} {frames.length === 1 ? "frame" : "frames"}</span>
          <span><Ratio size={15} /> {width}×{height}</span>
          <span><Clock3 size={15} /> {durationLabel(totalDuration)}</span>
        </div>

        <div className="top-actions">
          <button className="button button--ghost" type="button" onClick={() => inputRef.current?.click()}>
            <Plus size={17} /> Add frames
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={!frames.length || isExporting}
            onClick={handleExport}
          >
            {isExporting ? <span className="spinner" /> : <Download size={17} />}
            {isExporting ? `Encoding ${Math.round(progress * 100)}%` : "Export GIF"}
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
        <div className="preview-column">
          <div className="preview-stage">
            <div className="ambient ambient--one" />
            <div className="ambient ambient--two" />

            {selectedFrame ? (
              <div
                className="preview-canvas"
                style={{ aspectRatio: `${width} / ${height}` }}
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
              <button className="empty-state" type="button" onClick={() => inputRef.current?.click()}>
                <span className="empty-icon"><ImagePlus size={30} /></span>
                <strong>{isImporting ? "Preparing your frames…" : "Drop images to begin"}</strong>
                <span>PNG, JPG, WebP, BMP, or animated GIF</span>
                <span className="browse-pill"><Upload size={15} /> Choose images</span>
              </button>
            )}

            {isDraggingOver && (
              <div className="drop-overlay">
                <span><ImagePlus size={28} /></span>
                <strong>Drop to add frames</strong>
              </div>
            )}

            <div className="playback">
              <IconButton label="Previous frame" disabled={!frames.length} onClick={selectPrevious}>
                <SkipBack size={17} fill="currentColor" />
              </IconButton>
              <IconButton
                label={isPlaying ? "Pause preview" : "Play preview"}
                disabled={!frames.length}
                primary
                onClick={() => setIsPlaying((current) => !current)}
              >
                {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </IconButton>
              <IconButton label="Next frame" disabled={!frames.length} onClick={selectNext}>
                <SkipForward size={17} fill="currentColor" />
              </IconButton>
              <span className="playback-count">
                {selectedIndex >= 0 ? selectedIndex + 1 : 0}<i>/</i>{frames.length}
              </span>
            </div>
          </div>

          <div className="timeline-panel">
            <div className="timeline-heading">
              <div>
                <span className="eyebrow">TIMELINE</span>
                <span className="timeline-hint">Drag frames to reorder</span>
              </div>
              {frames.length > 0 && (
                <button className="text-button text-button--danger" type="button" onClick={clearAll}>
                  <Trash2 size={14} /> Clear all
                </button>
              )}
            </div>

            <div className="timeline" aria-label="GIF frame timeline">
              {frames.map((frame, index) => (
                <article
                  key={frame.id}
                  className={`frame-card${frame.id === selectedFrame?.id ? " is-selected" : ""}${draggingId === frame.id ? " is-dragging" : ""}`}
                  draggable
                  onDragStart={() => setDraggingId(frame.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(event) => { event.preventDefault(); reorder(frame.id); }}
                  onClick={() => setSelectedId(frame.id)}
                  aria-label={`Frame ${index + 1}: ${frame.name}`}
                >
                  <div className="frame-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frame.url} alt="" />
                    <span className="frame-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="drag-handle"><GripVertical size={15} /></span>
                    <button
                      type="button"
                      className="frame-delete"
                      aria-label={`Delete frame ${index + 1}`}
                      onClick={(event) => { event.stopPropagation(); removeFrame(frame.id); }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label className="duration-control" onClick={(event) => event.stopPropagation()}>
                    <Clock3 size={13} />
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
                </article>
              ))}

              <button className="add-card" type="button" onClick={() => inputRef.current?.click()}>
                <Plus size={22} />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>

        <aside className="settings-panel">
          <div className="settings-title">
            <div>
              <span className="eyebrow">EXPORT SETTINGS</span>
              <h1>Make it yours.</h1>
            </div>
            <span className="local-badge"><ShieldCheck size={14} /> Local only</span>
          </div>

          <div className="setting-group">
            <div className="setting-label">
              <label htmlFor="frame-time">Frame time</label>
              <span>Applied to every frame</span>
            </div>
            <div className="number-field number-field--unit">
              <input
                id="frame-time"
                type="number"
                min="0.02"
                max="60"
                step="0.05"
                value={defaultDuration}
                onChange={(event) => applyDefaultDuration(Number(event.target.value))}
              />
              <span>sec</span>
            </div>
            <div className="preset-row">
              {[0.1, 0.2, 0.5, 1].map((duration) => (
                <button
                  type="button"
                  key={duration}
                  className={defaultDuration === duration ? "is-active" : ""}
                  onClick={() => applyDefaultDuration(duration)}
                >
                  {secondsLabel(duration)}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-label">
              <span>Canvas size</span>
              <span>No artificial 800px cap</span>
            </div>
            <div className="dimension-row">
              <label className="number-field">
                <span>W</span>
                <input type="number" min="1" max="8192" value={width} onChange={(event) => updateWidth(Number(event.target.value))} />
              </label>
              <button className={`lock-button${locked ? " is-active" : ""}`} type="button" onClick={toggleLock} aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                {locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
              <label className="number-field">
                <span>H</span>
                <input type="number" min="1" max="8192" value={height} onChange={(event) => updateHeight(Number(event.target.value))} />
              </label>
            </div>
            <div className="preset-row preset-row--sizes">
              {[
                [640, 360],
                [1280, 720],
                [1920, 1080],
              ].map(([presetWidth, presetHeight]) => (
                <button
                  type="button"
                  key={presetWidth}
                  className={width === presetWidth && height === presetHeight ? "is-active" : ""}
                  onClick={() => { setWidth(presetWidth); setHeight(presetHeight); setLockedRatio(presetWidth / presetHeight); }}
                >
                  {presetWidth === 1920 ? "1080p" : presetWidth === 1280 ? "720p" : "360p"}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-label"><span>Image fit</span></div>
            <Segmented
              value={fit}
              onChange={setFit}
              label="Image fit"
              options={[
                { value: "fill", label: "Fill" },
                { value: "fit", label: "Fit" },
                { value: "stretch", label: "Stretch" },
              ]}
            />
          </div>

          <div className="setting-group setting-grid">
            <label>
              <span>Loop</span>
              <select value={loop} onChange={(event) => setLoop(event.target.value as LoopMode)}>
                <option value="forever">Forever</option>
                <option value="once">Play once</option>
                <option value="three">3 times</option>
              </select>
            </label>
            <label>
              <span>Quality</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value as QualityMode)}>
                <option value="best">Best</option>
                <option value="balanced">Balanced</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>

          <div className="privacy-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Your images stay on this device.</strong>
              <span>No upload, account, history, or saved project. Closing this tab clears the session.</span>
            </div>
          </div>

          <button
            className="export-button"
            type="button"
            disabled={!frames.length || isExporting}
            onClick={handleExport}
          >
            <span>
              {isExporting ? <span className="spinner" /> : <Download size={19} />}
              {isExporting ? "Encoding your GIF" : "Export GIF"}
            </span>
            <small>{isExporting ? `${Math.round(progress * 100)}% complete` : `${width}×${height} · ${frames.length} frames`}</small>
            {isExporting && <i style={{ width: `${progress * 100}%` }} />}
          </button>
        </aside>
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
