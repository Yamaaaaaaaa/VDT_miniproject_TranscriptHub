"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranscriptDetail } from "@/hooks/use-transcript-detail";
import { useCollab } from "@/hooks/use-collab";
import { TranscriptHeader } from "@/components/transcript/TranscriptHeader";
import { TranscriptMiniPlayer } from "@/components/transcript/TranscriptMiniPlayer";
import { TranscriptSegmentItem } from "@/components/transcript/TranscriptSegmentItem";
import { TranscriptHistoryModal } from "@/components/transcript/TranscriptHistoryModal";
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
  ShieldAlert,
  Clock,
} from "lucide-react";

export default function TranscriptEditPage() {
  const params = useParams();
  const router = useRouter();
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

  const { data: session } = useSession();

  // Resolve meetingId thực (UUID của Meeting) từ audioFileId trong URL.
  // Đồng thời lấy meeting role (HOST/EDITOR/VIEWER) của user hiện tại trong meeting đó.
  // Lưu ý: session.user.role là system role (ADMIN/USER) — KHÔNG phải meeting role.
  const [meetingId, setMeetingId] = useState<string>("");
  const [meetingRole, setMeetingRole] = useState<string>("VIEWER");
  const [showNoPermissionModal, setShowNoPermissionModal] = useState<boolean>(false);

  useEffect(() => {
    meetingsApi.getByAudioFile(fileId)
      .then(async (meeting: any) => {
        if (!meeting?.id) return;

        setMeetingId(meeting.id);

        // Lấy meeting role của user hiện tại (HOST/EDITOR/VIEWER)
        try {
          const members: any[] = await meetingsApi.getMembers(meeting.id);
          const currentUserId = parseInt((session?.user as any)?.id ?? "0", 10);
          const myMember = members.find((m: any) => m.userId === currentUserId);
          if (myMember?.role) setMeetingRole(myMember.role);
        } catch {
          // fallback VIEWER nếu không lấy được
        }
      })
      .catch((err: any) => {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message ?? "";
        const code = err?.response?.data?.code;
        if (status === 403 || msg.includes("permission") || code === 1007) {
          setShowNoPermissionModal(true);
        }
      });
  }, [fileId, session?.user?.id]);

  // Tự động chuyển hướng sau 5 giây nếu không có quyền
  useEffect(() => {
    if (showNoPermissionModal) {
      const timer = setTimeout(() => {
        router.push("/transcripts");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showNoPermissionModal, router]);

  const {
    state: collabState,
    segments: collabSegments,
    getYText,
    saveSnapshot,
    getVersions,
    getVersionDetail,
    restoreVersion,
  } = useCollab({
    meetingId,
    meetingRole,
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

  // State quản lý lịch sử phiên bản
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

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

  // Scroll active segment into view is disabled for the Edit page as requested.
  // We only show which segment is active/highlighted, but do not force scroll the page.
  /*
  useEffect(() => {
    if (activeSegmentIndex === null || !segmentRefs.current[activeSegmentIndex]) return;
    segmentRefs.current[activeSegmentIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeSegmentIndex]);
  */

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
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer shadow-sm"
            title="Lịch sử phiên bản"
          >
            <Clock size={11} className="text-slate-500" />
            <span>Lịch sử</span>
          </button>
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

      {/* No Permission Modal */}
      {showNoPermissionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Không có quyền truy cập</h3>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Bạn không phải là thành viên của cuộc họp này hoặc không có quyền chỉnh sửa bản dịch. Hệ thống sẽ chuyển bạn về danh sách.
              </p>
            </div>
            <button
              onClick={() => router.push("/transcripts")}
              className="w-full py-3 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all shadow-md shadow-red-500/25 cursor-pointer"
            >
              Quay lại danh sách bản dịch
            </button>
          </div>
        </div>
      )}

      {/* Lịch sử phiên bản Modal */}
      {showHistoryModal && (
        <TranscriptHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          getVersions={getVersions}
          getVersionDetail={getVersionDetail}
          restoreVersion={restoreVersion}
          formatDuration={formatDuration}
        />
      )}
    </div>
  );
}
