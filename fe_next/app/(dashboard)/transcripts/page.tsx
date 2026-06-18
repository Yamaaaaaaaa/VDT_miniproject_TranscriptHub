"use client";

import { useState, useEffect, useCallback } from "react";
import { transcriptsApi, filesApi } from "@/lib/api";
import Link from "next/link";
import {
  FileText, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, Sparkles, FolderOpen, Eye, Pencil
} from "lucide-react";

export default function TranscriptsListPage() {
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [transcriptsData, filesData] = await Promise.all([
        transcriptsApi.getAll(),
        filesApi.list(0, 100).catch((err) => {
          console.warn("Failed to load files list mapping:", err);
          return { content: [] };
        })
      ]);
      setTranscripts(transcriptsData || []);
      setFiles(filesData?.content || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Không thể tải danh sách bản dịch.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling for processing transcripts
  useEffect(() => {
    const hasProcessing = transcripts.some((t) => t.status === "PROCESSING");
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const transcriptsData = await transcriptsApi.getAll();
        setTranscripts(transcriptsData || []);
      } catch (err) {
        console.error("Lỗi cập nhật trạng thái tự động:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcripts]);

  const handleDelete = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa bản dịch này? Hành động này không thể hoàn tác.")) return;
    try {
      await transcriptsApi.delete(id);
      alert("Xóa bản dịch thành công!");
      loadData();
    } catch (err) {
      console.error(err);
      alert("Xóa bản dịch thất bại.");
    }
  };

  const getFileForTranscript = (audioFileId: string) => {
    return files.find((f) => f.id === audioFileId);
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
                                <Link
                                  href={`/transcripts/${t.audioFileId}/edit`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-xl transition-all"
                                >
                                  <Pencil size={12} />
                                  <span>Chỉnh sửa</span>
                                </Link>
                              </>
                            ) : (
                              <button
                                disabled
                                className="px-3.5 py-1.5 text-[10px] font-bold bg-slate-50 text-slate-300 border border-slate-100 rounded-xl cursor-not-allowed"
                              >
                                Chờ xử lý
                              </button>
                            )}
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
        </div>
      )}
    </div>
  );
}
