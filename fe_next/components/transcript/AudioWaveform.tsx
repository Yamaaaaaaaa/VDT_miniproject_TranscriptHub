"use client";

import React, { useMemo, useState, useRef } from "react";

interface AudioWaveformProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  barCount?: number;
  fileId?: string;
  disabled?: boolean;
  theme?: "light" | "dark";
}

// Simple LCG pseudo-random generator to produce consistent heights based on a seed
function getWaveformHeights(seed: string, count: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const heights: number[] = [];
  let currentSeed = Math.abs(h) || 123456789;
  for (let i = 0; i < count; i++) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const rnd = currentSeed / 233280;
    // Normalize height between 20% and 100% for a fuller appearance
    heights.push(Math.round(20 + rnd * 80));
  }
  return heights;
}

export function AudioWaveform({
  duration,
  currentTime,
  onSeek,
  barCount = 60,
  fileId = "demo-file",
  disabled = false,
  theme = "light",
}: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const heights = useMemo(() => {
    return getWaveformHeights(fileId, barCount);
  }, [fileId, barCount]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setHoverProgress(pct);
  };

  const handleMouseLeave = () => {
    setHoverProgress(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    onSeek(pct * duration);
  };

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-[2px] h-8 w-full cursor-pointer relative select-none ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {heights.map((height, idx) => {
        const barProgress = idx / barCount;
        const isPlayed = barProgress <= progress;
        const isHovered = hoverProgress !== null && barProgress <= hoverProgress;

        let barColor = "";
        if (theme === "light") {
          if (isHovered) {
            barColor = "bg-red-400";
          } else if (isPlayed) {
            barColor = "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.3)]";
          } else {
            barColor = "bg-slate-200";
          }
        } else {
          // dark theme
          if (isHovered) {
            barColor = "bg-red-400";
          } else if (isPlayed) {
            barColor = "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]";
          } else {
            barColor = "bg-slate-700";
          }
        }

        return (
          <div
            key={idx}
            className={`flex-1 rounded-full transition-colors duration-100 ${barColor}`}
            style={{ height: `${height}%`, minWidth: "1.5px" }}
          />
        );
      })}
    </div>
  );
}
