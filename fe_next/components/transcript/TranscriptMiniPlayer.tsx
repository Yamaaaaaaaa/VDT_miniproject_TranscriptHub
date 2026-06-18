"use client";

import { useRef, useEffect, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Volume2, Loader2 } from "lucide-react";

interface TranscriptMiniPlayerProps {
  audioFile: { fileName?: string } | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (v: number) => void;
  formatDuration: (seconds: number) => string;
}

export function TranscriptMiniPlayer({
  audioFile,
  isPlaying,
  currentTime,
  duration,
  volume,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  formatDuration,
}: TranscriptMiniPlayerProps) {
  const id = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const updateBounds = () => {
      const content =
        document.querySelector('[data-transcript-content]') ||
        document.querySelector('main');
      if (content) {
        const rect = content.getBoundingClientRect();
        setBounds({ left: rect.left, width: rect.width });
      }
    };

    updateBounds();

    // Re-measure on sidebar toggle (layout broadcasts custom event)
    const onSidebarToggle = () => setTimeout(updateBounds, 60);
    window.addEventListener("sidebar-toggle", onSidebarToggle);
    window.addEventListener("resize", updateBounds);

    return () => {
      window.removeEventListener("sidebar-toggle", onSidebarToggle);
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  if (!mounted) return null;

  const bar = (
    <div
      key={id}
      ref={barRef}
      className="fixed z-50 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      style={{ bottom: 0, left: bounds.left, width: bounds.width }}
    >
      {/* Top border accent */}
      <div className="h-0.5 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />

      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          disabled={!audioFile}
          className="p-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:hover:bg-slate-200 text-white disabled:text-slate-400 rounded-full transition-all shadow-md shadow-red-500/20 cursor-pointer shrink-0"
        >
          {!audioFile ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} className="ml-0.5" />
          )}
        </button>

        {/* Current time */}
        <span className="text-[10px] font-bold text-slate-400 shrink-0 w-9 text-right tabular-nums font-mono">
          {formatDuration(Math.round(currentTime))}
        </span>

        {/* Seek bar */}
        <div className="flex-1 relative">
          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-300"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            disabled={!audioFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-red-500 disabled:cursor-not-allowed"
          />
        </div>

        {/* Total duration */}
        <span className="text-[10px] font-bold text-slate-400 shrink-0 w-9 tabular-nums font-mono">
          {formatDuration(Math.round(duration))}
        </span>

        {/* Volume */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Volume2 size={12} className="text-slate-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-14 accent-red-500 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
          />
        </div>

        {/* File name */}
        {audioFile?.fileName && (
          <span className="text-[10px] font-bold text-slate-400 shrink-0 max-w-[120px] truncate hidden sm:block">
            {audioFile.fileName}
          </span>
        )}
      </div>
    </div>
  );

  return createPortal(bar, document.body);
}
