"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranscriptDetail } from "@/hooks/use-transcript-detail";
import { useCollab } from "@/hooks/use-collab";
import { TranscriptHeader } from "@/components/transcript/TranscriptHeader";
import { TranscriptMiniPlayer } from "@/components/transcript/TranscriptMiniPlayer";
import { TranscriptSegmentItem } from "@/components/transcript/TranscriptSegmentItem";
import { TranscriptSegment } from "@/types/transcript";
import { meetingsApi } from "@/lib/api";
import {
  FileText,
  AlertCircle,
  Save,
  RotateCcw,
  FileAudio,
  CheckCircle2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function TranscriptEditPage() {
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

  // Resolve the actual meeting UUID from audioFileId.
  // The collab service's saveTranscript needs a real meetingId (not audioFileId).
  // We find it by listing meetings and matching audioFile.id === fileId.
  const [meetingId, setMeetingId] = useState<string>(fileId);
  useEffect(() => {
    meetingsApi.list(0, 100, true)
      .then((data: any) => {
        const list: any[] = Array.isArray(data) ? data : (data?.content ?? data?.items ?? []);
        const match = list.find(
          (m: any) => m.audioFileId === fileId || m.audioFile?.id === fileId
        );
        if (match?.id) setMeetingId(match.id);
      })
      .catch(() => { /* fall back to fileId as room key */ });
  }, [fileId]);

  const {
    state: collabState,
    segments: collabSegments,
    getYText,
    saveSnapshot,
  } = useCollab({
    meetingId,
    initialSegments: transcript?.segments,
  });

  // Local edited segments — kept in sync with collabSegments
  const [editedSegments, setEditedSegments] = useState<Record<string, string>>({});
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isUserSeekingRef = useRef(false);

  // Seed local edits from transcript (only when collab hasn't synced yet)
  useEffect(() => {
    if (transcript && Object.keys(editedSegments).length === 0) {
      const initial: Record<string, string> = {};
      transcript.segments?.forEach((s) => {
        initial[s.id] = s.content;
      });
      setEditedSegments(initial);
    }
  }, [transcript, editedSegments]);

  // Sync collabSegments into editedSegments — this fires on every remote Y.Doc change
  useEffect(() => {
    if (!collabSegments.length) return;
    setEditedSegments((prev) => {
      const next = { ...prev };
      let changed = false;
      collabSegments.forEach((s) => {
        if (next[s.id] !== s.content) {
          next[s.id] = s.content;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [collabSegments]);

  // Track unsaved changes
  useEffect(() => {
    if (!transcript) return;
    const changed = collabSegments.some((s) => editedSegments[s.id] !== s.content);
    setHasChanges(changed);
  }, [editedSegments, collabSegments, transcript]);

  // Update active segment based on audio currentTime
  const updateActiveSegment = useCallback(() => {
    if (isUserSeekingRef.current) return;
    const segs = collabSegments.length > 0 ? collabSegments : (transcript?.segments ?? []);
    const idx = segs.findIndex(
      (s, i) =>
        currentTime >= s.startTime &&
        (i === segs.length - 1 || currentTime < segs[i + 1].startTime)
    );
    setActiveSegmentIndex(idx);
  }, [collabSegments, transcript, currentTime]);

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

  const handleContentChange = useCallback(
    (segmentId: string, content: string) => {
      setEditedSegments((prev) => ({ ...prev, [segmentId]: content }));
    },
    []
  );

  const handleReset = useCallback(() => {
    const source = collabSegments.length > 0 ? collabSegments : (transcript?.segments ?? []);
    const initial: Record<string, string> = {};
    source.forEach((s) => {
      initial[s.id] = s.content;
    });
    setEditedSegments(initial);
    setHasChanges(false);
  }, [transcript, collabSegments]);

  const handleSave = useCallback(async () => {
    if (!transcript) return;
    setIsSaving(true);
    try {
      // Persist via collab gateway snapshot API
      if (collabState.connected) {
        await saveSnapshot();
      }
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      alert("Lưu thất bại. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  }, [transcript, collabState.connected, saveSnapshot]);

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
      {/* Sticky Header */}
      <div className="sticky top-0 z-40">
        <TranscriptHeader
          transcript={transcript}
          audioFile={audioFile}
          formatDuration={formatDuration}
          mode="edit"
        />
      </div>

      {/* Edit toolbar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
          {audioFile && (
            <>
              <div className="flex items-center gap-1.5">
                <FileAudio size={12} />
                <span>{formatBytes(audioFile.fileSize)}</span>
              </div>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span>{formatDuration(audioFile.durationSeconds)}</span>
            </>
          )}

          {/* Collab status */}
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          {collabState.connected ? (
            <span className="flex items-center gap-1 text-green-500">
              <Wifi size={10} />
              <span>Live</span>
              {collabState.users.length > 1 && (
                <span className="flex items-center gap-0.5 ml-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <Users size={10} />
                  <span>{collabState.users.length}</span>
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <WifiOff size={10} />
              <span>Offline</span>
            </span>
          )}
          {!collabState.canEdit && collabState.connected && (
            <>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-amber-500">Chỉ xem</span>
            </>
          )}

          {hasChanges && (
            <>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-amber-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                Có thay đổi chưa lưu
              </span>
            </>
          )}
          {!hasChanges && !isSaving && (
            <>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="text-green-500 flex items-center gap-1">
                <CheckCircle2 size={10} />
                Đã lưu
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw size={11} />
              <span>Hoàn tác</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold bg-red-500 hover:bg-red-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <span className="animate-spin inline-block">
                <RotateCcw size={11} />
              </span>
            ) : saveSuccess ? (
              <CheckCircle2 size={11} />
            ) : (
              <Save size={11} />
            )}
            <span>{isSaving ? "Đang lưu..." : saveSuccess ? "Đã lưu!" : "Lưu thay đổi"}</span>
          </button>
        </div>
      </div>

      {/* Segments list */}
      {collabSegments.length === 0 && (transcript?.segments ?? []).length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white border border-slate-100 rounded-3xl shadow-sm">
          <FileText size={48} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-500">Chưa có đoạn dịch nào</p>
        </div>
      ) : (
        <div className="space-y-3 pb-28">
          {(collabSegments.length > 0 ? collabSegments : transcript!.segments ?? []).map((segment, index) => (
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
                mode="edit"
                editedContent={editedSegments[segment.id]}
                canEdit={collabState.canEdit}
                getYText={getYText}
                onContentChange={(content) => handleContentChange(segment.id, content)}
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
