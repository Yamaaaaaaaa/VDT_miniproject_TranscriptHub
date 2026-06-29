"use client";

import { useState, useEffect, useCallback } from "react";
import { transcriptsApi, filesApi, meetingsApi } from "@/lib/api";
import Link from "next/link";
import ConfirmModal from "@/components/confirm-modal";
import {
  FileText, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, Sparkles, FolderOpen, Eye, Pencil,
  ChevronLeft, ChevronRight, RotateCcw
} from "lucide-react";

export default function TranscriptsListPage() {
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reTranscribingId, setReTranscribingId] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
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

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, isDanger = false) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      },
      isDanger,
      isAlert: false,
      type: isDanger ? 'error' : 'warning',
    });
  };

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

  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [transcriptsData, filesData, meetingsData] = await Promise.all([
        transcriptsApi.getAll(page, size),
        filesApi.list(0, 100).catch((err) => {
          console.warn("Failed to load files list mapping:", err);
          return { content: [] };
        }),
        meetingsApi.list(0, 100).catch((err) => {
          console.warn("Failed to load meetings list mapping:", err);
          return { content: [] };
        })
      ]);
      if (transcriptsData) {
        setTranscripts(transcriptsData.content || transcriptsData || []);
        setTotalPages(transcriptsData.totalPages || 1);
        setTotalElements(transcriptsData.totalElements || 0);
      } else {
        setTranscripts([]);
      }
      setFiles(filesData?.content || []);
      setMeetings(meetingsData?.content || meetingsData || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Không thể tải danh sách bản dịch.");
    } finally {
      setLoading(false);
    }
  }, [page, size]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling for processing transcripts
  useEffect(() => {
    const hasProcessing = transcripts.some((t) => t.status === "PROCESSING");
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const transcriptsData = await transcriptsApi.getAll(page, size);
        if (transcriptsData) {
          setTranscripts(transcriptsData.content || transcriptsData || []);
          setTotalPages(transcriptsData.totalPages || 1);
          setTotalElements(transcriptsData.totalElements || 0);
        }
      } catch (err) {
        console.error("Lỗi cập nhật trạng thái tự động:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcripts, page, size]);

  const handleDelete = (id: number) => {
    triggerConfirm(
      "Xóa bản dịch",
      "Bạn có chắc chắn muốn xóa bản dịch này? Hành động này không thể hoàn tác.",
      async () => {
        try {
          await transcriptsApi.delete(id);
          triggerAlert("Thành công", "Xóa bản dịch thành công!", "success");
          loadData();
        } catch (err) {
          console.error(err);
          triggerAlert("Lỗi", "Xóa bản dịch thất bại.", "error");
        }
      },
      true
    );
  };

  const handleReTranscribe = (audioFileId: string, fileName: string) => {
    triggerConfirm(
      "Chạy Dịch AI Lại",
      `Bạn có chắc chắn muốn dịch lại "${fileName}"?\n\nHành động này sẽ xóa nội dung bản dịch hiện tại và chạy lại toàn bộ quá trình AI từ đầu.`,
      async () => {
        setReTranscribingId(audioFileId);
        try {
          await transcriptsApi.reTranscribe(audioFileId);
          triggerAlert("Đã kích hoạt", "Yêu cầu dịch lại đã được gửi! Quá trình AI đang chạy lại.", "info");
          loadData();
        } catch (err: any) {
          console.error(err);
          triggerAlert("Lỗi", err?.response?.data?.message || "Không thể kích hoạt dịch lại.", "error");
        } finally {
          setReTranscribingId(null);
        }
      },
      false
    );
  };

  const getFileForTranscript = (audioFileId: string) => {
    return files.find((f) => f.id === audioFileId);
  };

  const getMeetingForTranscript = (audioFileId: string) => {
    return meetings.find((m) => m.audioFileId === audioFileId);
  };

  // Formatting helpers
  const formatBytes = (bytes: any, decimals = 2) => {
    const b = Number(bytes);
    if (!b || b === 0) return "N/A";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Sparkles size={22} className="text-red-500" />
            Quản lý Bản Dịch (Scripts)
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-1">
            Danh sách toàn bộ các văn bản dịch thuật được chuyển đổi bằng công nghệ AI từ file âm thanh
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Làm mới</span>
        </button>
      </div>

      {loading && transcripts.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 bg-white border border-slate-100 rounded-3xl shadow-sm">
          <Loader2 size={36} className="animate-spin text-red-500" />
          <p className="text-xs font-bold">Đang tải danh sách bản dịch...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-500 border border-red-100 rounded-3xl text-center space-y-4">
          <AlertCircle size={40} className="mx-auto" />
          <p className="text-sm font-bold">{error}</p>
          <button
            onClick={loadData}
            className="px-5 py-2 text-xs font-bold bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <FolderOpen size={18} className="text-red-500" />
              Danh sách bản dịch ({transcripts.filter((t) => t.status === "COMPLETED").length} bản dịch hoàn tất)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3 pl-2">File âm thanh gốc</th>
                  <th className="pb-3">Trạng thái</th>
                  <th className="pb-3">Thời lượng</th>
                  <th className="pb-3">Dung lượng</th>
                  <th className="pb-3">Cập nhật gần nhất</th>
                  <th className="pb-3 pr-2 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {transcripts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText size={48} className="text-slate-300 mb-2" />
                        <p className="text-sm font-bold text-slate-500">Chưa có bản dịch nào</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">
                          Các bản dịch sẽ xuất hiện sau khi bạn tải file âm thanh lên hệ thống ở trang Quản lý File.
                        </p>
                        <Link
                          href="/files"
                          className="px-5 py-2.5 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl shadow-md shadow-red-500/25 transition-all mt-4 inline-block"
                        >
                          Tới Quản lý File
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transcripts.map((t) => {
                    const relatedFile = getFileForTranscript(t.audioFileId);
                    const relatedMeeting = getMeetingForTranscript(t.audioFileId);
                    const hasMeeting = !!relatedMeeting;
                    const fileName = relatedFile?.fileName || `File âm thanh (${t.audioFileId.slice(0, 8)})`;
                    const fileSize = relatedFile ? formatBytes(relatedFile.fileSize) : "N/A";
                    const fileDuration = relatedFile ? formatDuration(relatedFile.durationSeconds) : "N/A";
                    const isCompleted = t.status === "COMPLETED";

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-all group">
                        <td className="py-3.5 pl-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                              <FileText size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate max-w-[240px]" title={fileName}>
                                {fileName}
                              </p>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">ID: {t.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5">
                          {t.status === "COMPLETED" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                              <CheckCircle2 size={10} /> Hoàn tất
                            </span>
                          ) : t.status === "PROCESSING" ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 animate-pulse">
                              <Loader2 size={10} className="animate-spin" /> Đang xử lý...
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                              <AlertCircle size={10} /> Thất bại
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-slate-500 font-bold">{fileDuration}</td>
                        <td className="py-3.5 text-slate-500">{fileSize}</td>
                        <td className="py-3.5 text-slate-400">{formatDate(t.updatedAt)}</td>
                        <td className="py-3.5 pr-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isCompleted ? (
                              <>
                                <Link
                                  href={`/transcripts/${t.audioFileId}/view`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition-all"
                                >
                                  <Eye size={12} />
                                  <span>Xem</span>
                                </Link>
                                {hasMeeting && (
                                  <Link
                                    href={`/transcripts/${t.audioFileId}/edit`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-xl transition-all"
                                  >
                                    <Pencil size={12} />
                                    <span>Chỉnh sửa</span>
                                  </Link>
                                )}
                              </>
                            ) : (
                              <button
                                disabled
                                className="px-3.5 py-1.5 text-[10px] font-bold bg-slate-50 text-slate-300 border border-slate-100 rounded-xl cursor-not-allowed"
                              >
                                Chờ xử lý
                              </button>
                            )}
                            {/* Nút Chạy Dịch AI Lại — xuất hiện cho mọi trạng thái */}
                            <button
                              onClick={() => handleReTranscribe(t.audioFileId, fileName)}
                              disabled={t.status === "PROCESSING" || reTranscribingId === t.audioFileId}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-600 hover:text-amber-700 border border-amber-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Chạy dịch AI lại (thay thế nội dung hiện tại)"
                            >
                              {reTranscribingId === t.audioFileId
                                ? <Loader2 size={12} className="animate-spin" />
                                : <RotateCcw size={12} />}
                              <span>Dịch lại</span>
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                              title="Xóa bản dịch"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalElements > 0 && (
            <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-2">
              <span className="text-xs text-slate-400 font-bold">
                Trang {page + 1} / {totalPages}
              </span>
              <div className="flex gap-1">
                <button 
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 transition-all cursor-pointer"
                  disabled={page === 0}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                  className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 transition-all cursor-pointer"
                  disabled={page === totalPages - 1}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        isDanger={confirmState.isDanger}
        isAlert={confirmState.isAlert}
        type={confirmState.type}
      />
    </div>
  );
}
