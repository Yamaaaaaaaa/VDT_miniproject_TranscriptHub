"use client";

import { useRef, useCallback, memo } from "react";
import { TranscriptSegment } from "@/types/transcript";

interface TranscriptViewSegmentItemProps {
  segment: TranscriptSegment;
  index: number;
  isActive?: boolean;
  onSegmentClick?: (startTime: number) => void;
  formatDuration: (seconds: number) => string;
}

export const TranscriptViewSegmentItem = memo(function TranscriptViewSegmentItem({
  segment,
  index,
  isActive = false,
  onSegmentClick,
  formatDuration,
}: TranscriptViewSegmentItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = useCallback(() => {
    if (onSegmentClick) {
      onSegmentClick(segment.startTime);
    }
  }, [onSegmentClick, segment.startTime]);

  return (
    <div
      ref={outerRef}
      onClick={handleContainerClick}
      className={`group relative rounded-2xl border p-4 transition-all cursor-pointer select-none ${
        isActive
          ? "border-red-200 bg-red-50/30 shadow-sm shadow-red-100/50"
          : "border-slate-100 bg-white hover:border-red-100 hover:bg-red-50/10"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Segment number badge */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black flex items-center justify-center">
            {index + 1}
          </span>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isActive
                ? "bg-red-500 text-white shadow-md shadow-red-500/30"
                : "bg-slate-50 text-slate-400"
            }`}
          >
            {isActive ? (
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            ) : (
              <span className="w-1.5 h-1.5 bg-current rounded-full" />
            )}
          </div>
        </div>

        {/* Speaker & Time */}
        <div className="shrink-0 min-w-[140px]">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black mb-2 bg-red-50 text-red-600 max-w-[130px] w-full">
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
            <span className="truncate">{segment.speaker}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
            <span className="font-mono">{formatDuration(segment.startTime)}</span>
            <span>→</span>
            <span className="font-mono">{formatDuration(segment.endTime)}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap break-words cursor-pointer hover:text-red-600 transition-colors">
            {segment.content}
          </p>
        </div>
      </div>

      {/* Active indicator line */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 rounded-full" />
      )}
    </div>
  );
});
