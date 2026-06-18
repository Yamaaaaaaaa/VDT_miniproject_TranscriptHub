"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranscriptDetail } from "@/hooks/use-transcript-detail";
import { TranscriptHeader } from "@/components/transcript/TranscriptHeader";
import { TranscriptMiniPlayer } from "@/components/transcript/TranscriptMiniPlayer";
import { TranscriptSegmentItem } from "@/components/transcript/TranscriptSegmentItem";
import { FileText, AlertCircle, Loader2, FileAudio } from "lucide-react";

export default function TranscriptViewPage() {
  const params = useParams();
  const fileId = params.fileId as string;

  const {
    transcript,
    audioFile,
    loading,
    error,
    isPlaying,
    currentTime,
    duration,
    volume,
    togglePlay,
    seekTo,
    handleVolumeChange,
    formatDuration,
    reload,
  } = useTranscriptDetail(fileId);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isUserSeekingRef = useRef(false);

  // Update active segment based on audio currentTime
  const updateActiveSegment = useCallback(() => {
    if (!transcript || isUserSeekingRef.current) return;
    const segments = transcript.segments ?? [];
    const idx = segments.findIndex(
      (s, i) =>
        currentTime >= s.startTime &&
        (i === segments.length - 1 || currentTime < segments[i + 1].startTime)
    );
    setActiveSegmentIndex(idx);
  }, [transcript, currentTime]);

  useEffect(() => {
    updateActiveSegment();
  }, [updateActiveSegment]);

  // Scroll active segment into view
  useEffect(() => {
    if (activeSegmentIndex === null || !segmentRefs.current[activeSegmentIndex]) return;
    segmentRefs.current[activeSegmentIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeSegmentIndex]);

  const handleSegmentClick = useCallback(
    (startTime: number) => {
      isUserSeekingRef.current = true;
      seekTo(startTime);
      setTimeout(() => {
        isUserSeekingRef.current = false;
      }, 1500);
    },
    [seekTo]
  );

  const formatBytes = (bytes: number) => {
    if (!bytes) return "N/A";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 bg-white border border-slate-100 rounded-3xl shadow-sm animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-500 border border-red-100 rounded-3xl text-center space-y-4">
        <AlertCircle size={40} className="mx-auto" />
        <p className="text-sm font-bold">{error}</p>
        <button
          onClick={reload}
          className="px-5 py-2.5 text-xs font-bold bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-center space-y-4">
        <FileText size={40} className="mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-500">Không tìm thấy bản dịch</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sticky Header with audio player */}
      <div className="sticky top-0 z-40">
        <TranscriptHeader
          transcript={transcript}
          audioFile={audioFile}
          formatDuration={formatDuration}
          mode="view"
        />
      </div>

      {/* File metadata bar */}
      {audioFile && (
        <div className="flex items-center gap-4 px-1 text-[10px] font-bold text-slate-400">
          <div className="flex items-center gap-1.5">
            <FileAudio size={12} />
            <span>{formatBytes(audioFile.fileSize)}</span>
          </div>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>{formatDuration(audioFile.durationSeconds)}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>{audioFile.mimeType}</span>
        </div>
      )}

      {/* Segments list */}
      {(transcript.segments ?? []).length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white border border-slate-100 rounded-3xl shadow-sm">
          <FileText size={48} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Chưa có đoạn dịch nào</p>
        </div>
      ) : (
        <div className="space-y-3 pb-28">
          {transcript.segments.map((segment, index) => (
            <div
              key={segment.id}
              ref={(el) => {
                segmentRefs.current[index] = el;
              }}
            >
              <TranscriptSegmentItem
                segment={segment}
                index={index}
                isActive={activeSegmentIndex === index}
                mode="view"
                onSegmentClick={handleSegmentClick}
                formatDuration={formatDuration}
              />
            </div>
          ))}
        </div>
      )}

      {/* Mini player (sticky bottom) */}
      <TranscriptMiniPlayer
        audioFile={audioFile}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onVolumeChange={handleVolumeChange}
        formatDuration={formatDuration}
      />
    </div>
  );
}
