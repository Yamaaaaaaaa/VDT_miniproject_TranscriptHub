"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranscriptDetail } from "@/hooks/use-transcript-detail";
import { useCollab } from "@/hooks/use-collab";
import { PlaybackProvider, usePlayback } from "@/context/PlaybackContext";
import { TranscriptEditHeader } from "@/components/transcript/TranscriptEditHeader";
import { TranscriptMiniPlayer } from "@/components/transcript/TranscriptMiniPlayer";
import { TranscriptEditSegmentItem } from "@/components/transcript/TranscriptEditSegmentItem";
import { TranscriptHistoryModal } from "@/components/transcript/TranscriptHistoryModal";
import { meetingsApi } from "@/lib/api";
import ConfirmModal from "@/components/confirm-modal";
import {
  FileText,
  AlertCircle,
  Save,
  RotateCcw,
  FileAudio,
  CheckCircle2,
  Wifi,
  WifiOff,
  ShieldAlert,
  Clock,
} from "lucide-react";

const EMPTY_ARRAY: any[] = [];

export default function TranscriptEditPage() {
  const params = useParams();
  const fileId = params.fileId as string;
  const { data: session } = useSession();
  const token = session?.accessToken as string;

  if (!token) {
    return (
      <div className="space-y-6" suppressHydrationWarning>
        <div className="h-28 bg-white border border-slate-100 rounded-3xl shadow-sm animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PlaybackProvider fileId={fileId} token={token}>
      <TranscriptEditPageContent fileId={fileId} session={session} />
    </PlaybackProvider>
  );
}

function TranscriptEditPageContent({ fileId, session }: { fileId: string; session: any }) {
  const router = useRouter();
  const playback = usePlayback();

  // Reusable Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    isAlert?: boolean;
    type?: 'warning' | 'success' | 'info' | 'error';
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDanger: false,
    isAlert: false,
    type: 'warning',
  });

  const triggerAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      },
      isDanger: type === 'error',
      isAlert: true,
      type,
    });
  };

  const {
    transcript,
    audioFile,
    loading,
    error,
    formatDuration,
    reload,
  } = useTranscriptDetail(fileId, { skipAudio: true });

  // Resolve meetingId thực (UUID của Meeting) từ audioFileId trong URL.
  // Đồng thời lấy meeting role (HOST/EDITOR/VIEWER) của user hiện tại trong meeting đó.
  const [meetingId, setMeetingId] = useState<string>("");
  const [meetingRole, setMeetingRole] = useState<string>("VIEWER");
  const [showNoPermissionModal, setShowNoPermissionModal] = useState<boolean>(false);
  const [noPermissionTitle, setNoPermissionTitle] = useState<string>("Không có quyền truy cập");
  const [noPermissionDesc, setNoPermissionDesc] = useState<string>("Bạn không phải là thành viên của cuộc họp này hoặc không có quyền chỉnh sửa bản dịch. Hệ thống sẽ chuyển bạn về danh sách.");

  useEffect(() => {
    meetingsApi.getByAudioFile(fileId)
      .then(async (meeting: any) => {
        if (!meeting?.id) {
          setNoPermissionTitle("Không tìm thấy cuộc họp");
          setNoPermissionDesc("Bản dịch này không được liên kết với cuộc họp nào nên không thể chỉnh sửa. Hệ thống sẽ tự động quay lại.");
          setShowNoPermissionModal(true);
          return;
        }

        setMeetingId(meeting.id);

        // Lấy meeting role của user hiện tại (HOST/EDITOR/VIEWER)
        try {
          const members: any[] = await meetingsApi.getMembers(meeting.id);
          const currentUserId = parseInt((session?.user as any)?.id ?? "0", 10);
          const myMember = members.find((m: any) => m.userId === currentUserId);
          if (myMember?.role) setMeetingRole(myMember.role);
        } catch {
          // fallback VIEWER
        }
      })
      .catch((err: any) => {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message ?? "";
        const code = err?.response?.data?.code;
        if (status === 404 || code === 5001) {
          setNoPermissionTitle("Không tìm thấy cuộc họp");
          setNoPermissionDesc("Bản dịch này không được liên kết với cuộc họp nào nên không thể chỉnh sửa. Hệ thống sẽ tự động quay lại.");
          setShowNoPermissionModal(true);
        } else if (status === 403 || msg.includes("permission") || code === 1007) {
          setNoPermissionTitle("Không có quyền truy cập");
          setNoPermissionDesc("Bạn không phải là thành viên của cuộc họp này hoặc không có quyền chỉnh sửa bản dịch. Hệ thống sẽ chuyển bạn về danh sách.");
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
    getAwareness,
    setFocus,
    updateSpeaker,
    saveSnapshot,
    getVersions,
    getVersionDetail,
    restoreVersion,
  } = useCollab({
    meetingId,
    meetingRole,
    session,
    initialSegments: transcript?.segments,
  });

  // Đồng bộ danh sách segment sang PlaybackManager để tính toán active segment
  useEffect(() => {
    if (playback && transcript) {
      playback.setSegments(collabSegments.length > 0 ? collabSegments : (transcript.segments ?? []));
    }
  }, [playback, collabSegments, transcript]);

  const [activeEditSegmentId, setActiveEditSegmentId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  const localEditsRef = useRef<Record<string, string>>({});

  // State quản lý lịch sử phiên bản
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Clear activeEditSegmentId when clicking outside segments
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-segment-card]")) {
        if (!target.closest(".quill-editor-wrapper") && !target.closest("input") && !target.closest("button") && !target.closest(".ql-snow") && !target.closest(".ql-toolbar")) {
          setActiveEditSegmentId(null);
        }
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // Warning when leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn rời đi?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const handleSegmentClick = useCallback(
    (startTime: number) => {
      playback?.seekTo(startTime);
    },
    [playback]
  );

  const handleContentChange = useCallback(
    (segmentId: string, content: string) => {
      localEditsRef.current[segmentId] = content;
      setHasChanges(true);
    },
    []
  );

  const handleSpeakerChange = useCallback(
    (segmentId: string, speaker: string) => {
      updateSpeaker(segmentId, speaker);
      setHasChanges(true);
    },
    [updateSpeaker]
  );

  const handleReset = useCallback(() => {
    localEditsRef.current = {};
    setHasChanges(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!transcript) return;
    setIsSaving(true);
    try {
      if (collabState.connected) {
        await saveSnapshot();
      }
      localEditsRef.current = {};
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      triggerAlert("Lưu thất bại", "Lưu bản dịch thất bại. Vui lòng thử lại.", "error");
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
      <div className="space-y-6" suppressHydrationWarning>
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

  const currentUserId = session?.user?.id;

  return (
    <div className="space-y-4" suppressHydrationWarning>
      {/* Sticky Header */}
      <div className="sticky top-0 z-40">
        <TranscriptEditHeader
          transcript={transcript}
          audioFile={audioFile}
          formatDuration={formatDuration}
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
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-green-500">
                <Wifi size={10} />
                <span>Live</span>
              </span>
              {collabState.users.length > 0 && (
                <div className="flex items-center -space-x-1.5 overflow-hidden ml-1">
                  {collabState.users.map((user) => {
                    const initials = user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const isSelf = String(user.id) === String(currentUserId);
                    return (
                      <div
                        key={user.id}
                        className="relative group cursor-pointer"
                        title={`${user.name} (${user.email})${isSelf ? " - Bạn" : ""}`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white border-2 border-white transition-all hover:scale-110 hover:z-30 relative shadow-sm"
                          style={{ backgroundColor: user.color }}
                        >
                          {initials || "?"}
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-50 pointer-events-none">
                          {user.name} {isSelf && "(Bạn)"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
          {collabState.canEdit && (
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
          )}
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
          {(collabSegments.length > 0 ? collabSegments : transcript.segments ?? []).map((segment, index) => {
            const segmentId = segment.id;
            const otherEditorsOnSpeaker = collabState.users.filter(
              (u) =>
                String(u.id) !== String(currentUserId) &&
                u.focus?.segmentId === segmentId &&
                u.focus?.field === "speaker"
            );
            const otherEditorsOnContent = collabState.users.filter(
              (u) =>
                String(u.id) !== String(currentUserId) &&
                u.focus?.segmentId === segmentId &&
                u.focus?.field === "content"
            );

            return (
              <div
                key={segmentId}
                data-segment-card
                ref={(el) => {
                  segmentRefs.current[index] = el;
                }}
              >
                <TranscriptEditSegmentItem
                  segment={segment}
                  index={index}
                  isActiveEditor={activeEditSegmentId === segmentId}
                  onActivateEditor={setActiveEditSegmentId}
                  canEdit={collabState.canEdit}
                  getYText={getYText}
                  getAwareness={getAwareness}
                  setFocus={setFocus}
                  otherEditorsOnSpeaker={otherEditorsOnSpeaker.length > 0 ? otherEditorsOnSpeaker : EMPTY_ARRAY}
                  otherEditorsOnContent={otherEditorsOnContent.length > 0 ? otherEditorsOnContent : EMPTY_ARRAY}
                  currentUserId={currentUserId}
                  onContentChange={handleContentChange}
                  onSpeakerChange={handleSpeakerChange}
                  onSegmentClick={handleSegmentClick}
                  formatDuration={formatDuration}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Mini player (sticky bottom) */}
      <TranscriptMiniPlayer
        audioFile={audioFile}
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
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{noPermissionTitle}</h3>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                {noPermissionDesc}
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
          canEdit={collabState.canEdit}
        />
      )}
      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel ?? (() => setConfirmState(prev => ({ ...prev, isOpen: false })))}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        isDanger={confirmState.isDanger}
        isAlert={confirmState.isAlert}
        type={confirmState.type}
      />
    </div>
  );
}
