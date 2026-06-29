"use client";

import { useRef, useEffect, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, Volume2, Loader2 } from "lucide-react";
import { usePlayback } from "@/context/PlaybackContext";

interface TranscriptMiniPlayerProps {
  audioFile: { fileName?: string } | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  onTogglePlay?: () => void;
  onSeek?: (time: number) => void;
  onVolumeChange?: (v: number) => void;
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
  const playback = usePlayback();
  const barRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  // Local state for when using PlaybackManager (Edit Page)
  const [localCurrentTime, setLocalCurrentTime] = useState(currentTime ?? 0);
  const [localDuration, setLocalDuration] = useState(duration ?? 0);
  const [localVolume, setLocalVolume] = useState(volume ?? 0.8);
  const [localIsPlaying, setLocalIsPlaying] = useState(isPlaying ?? false);

  useEffect(() => { setMounted(true); }, []);

  // Subscribe to PlaybackManager if available
  useEffect(() => {
    if (!playback) return;

    const unsubTime = playback.subscribeToTime(setLocalCurrentTime);
    const unsubDur = playback.subscribeToDuration(setLocalDuration);
    const unsubVol = playback.subscribeToVolume(setLocalVolume);
    const unsubState = playback.subscribeToState(setLocalIsPlaying);

    return () => {
      unsubTime();
      unsubDur();
      unsubVol();
      unsubState();
    };
  }, [playback]);

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

    const onSidebarToggle = () => setTimeout(updateBounds, 60);
    window.addEventListener("sidebar-toggle", onSidebarToggle);
    window.addEventListener("resize", updateBounds);

    return () => {
      window.removeEventListener("sidebar-toggle", onSidebarToggle);
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  if (!mounted) return null;

  // Use local state if playback is available, otherwise use props
  const activeCurrentTime = playback ? localCurrentTime : (currentTime ?? 0);
  const activeDuration = playback ? localDuration : (duration ?? 0);
  const activeVolume = playback ? localVolume : (volume ?? 0.8);
  const activeIsPlaying = playback ? localIsPlaying : (isPlaying ?? false);

  const handleTogglePlay = () => {
    if (playback) {
      playback.togglePlay();
    } else {
      onTogglePlay?.();
    }
  };

  const handleSeek = (time: number) => {
    if (playback) {
      playback.seekTo(time);
    } else {
      onSeek?.(time);
    }
  };

  const handleVolumeChange = (v: number) => {
    if (playback) {
      playback.setVolume(v);
    } else {
      onVolumeChange?.(v);
    }
  };

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
          onClick={handleTogglePlay}
          disabled={!audioFile}
          className="p-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:hover:bg-slate-200 text-white disabled:text-slate-400 rounded-full transition-all shadow-md shadow-red-500/20 cursor-pointer shrink-0"
        >
          {!audioFile ? (
            <Loader2 size={14} className="animate-spin" />
          ) : activeIsPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} className="ml-0.5" />
          )}
        </button>

        {/* Current time */}
        <span className="text-[10px] font-bold text-slate-400 shrink-0 w-9 text-right tabular-nums font-mono">
          {formatDuration(Math.round(activeCurrentTime))}
        </span>

        {/* Seek bar */}
        <div className="flex-1 relative">
          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full transition-all duration-300"
              style={{ width: activeDuration > 0 ? `${(activeCurrentTime / activeDuration) * 100}%` : "0%" }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={activeDuration || 100}
            value={activeCurrentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            disabled={!audioFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-red-500 disabled:cursor-not-allowed"
          />
        </div>

        {/* Total duration */}
        <span className="text-[10px] font-bold text-slate-400 shrink-0 w-9 tabular-nums font-mono">
          {formatDuration(Math.round(activeDuration))}
        </span>

        {/* Volume */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Volume2 size={12} className="text-slate-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={activeVolume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
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
