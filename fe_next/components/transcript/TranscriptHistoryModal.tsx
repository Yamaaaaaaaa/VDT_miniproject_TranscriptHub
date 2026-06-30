"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, RotateCcw, GitCompare, Trash2 } from "lucide-react";
import { diffWords, DiffChange } from "@/lib/diff";

interface TranscriptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  getVersions: () => Promise<any[]>;
  getVersionDetail: (versionId: number) => Promise<any>;
  restoreVersion: (versionId: number) => Promise<boolean>;
  deleteVersion: (versionId: number) => Promise<boolean>;
  formatDuration: (seconds: number) => string;
  canEdit?: boolean;
}

export function TranscriptHistoryModal({
  isOpen,
  onClose,
  getVersions,
  getVersionDetail,
  restoreVersion,
  deleteVersion,
  formatDuration,
  canEdit = false,
}: TranscriptHistoryModalProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);
  const [loadingVersionDetail, setLoadingVersionDetail] = useState<boolean>(false);
  const [showConfirmRestore, setShowConfirmRestore] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // States for version comparison
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);
  const [diffResult, setDiffResult] = useState<DiffChange[] | null>(null);
  const [comparedVersions, setComparedVersions] = useState<{ v1: any; v2: any } | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    setSelectedVersion(null);
    setIsComparing(false);
    setIsSplitView(false);
    setDiffResult(null);
    setComparedVersions(null);
    try {
      const list = await getVersions();
      setVersions(list);
    } catch (err) {
      console.error("Lỗi lấy danh sách phiên bản:", err);
    } finally {
      setLoadingVersions(false);
    }
  }, [getVersions]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  const handleSelectVersion = useCallback(async (version: any) => {
    // Exit comparison mode when previewing a single version
    setIsComparing(false);
    setLoadingVersionDetail(true);
    setSelectedVersion(null);
    try {
      const details = await getVersionDetail(version.id);
      if (details) {
        setSelectedVersion(details);
      }
    } catch (err) {
      console.error("Lỗi lấy chi tiết phiên bản:", err);
    } finally {
      setLoadingVersionDetail(false);
    }
  }, [getVersionDetail]);

  const handleStartCompareWithLatest = useCallback(async () => {
    if (!selectedVersion || versions.length === 0) return;
    setIsComparing(true);
    setLoadingDiff(true);
    setDiffResult(null);
    try {
      // Phiên bản mới nhất là phần tử đầu tiên trong danh sách (versions[0])
      const latestVersionSummary = versions[0];
      if (!latestVersionSummary) {
        throw new Error("No latest version found");
      }

      const latestDetail = await getVersionDetail(latestVersionSummary.id);

      // So sánh phiên bản chọn (v1 - cũ) với phiên bản mới nhất (v2 - mới)
      setComparedVersions({ v1: selectedVersion, v2: latestDetail });

      const diffs = diffWords(selectedVersion.rawText || "", latestDetail.rawText || "");
      setDiffResult(diffs);
    } catch (err) {
      console.error("Lỗi khi so sánh với phiên bản mới nhất:", err);
      alert("Đã xảy ra lỗi khi tải dữ liệu để so sánh.");
      setIsComparing(false);
    } finally {
      setLoadingDiff(false);
    }
  }, [selectedVersion, versions, getVersionDetail]);

  const handleConfirmRestore = useCallback(async () => {
    if (!selectedVersion) return;
    setIsRestoring(true);
    try {
      const success = await restoreVersion(selectedVersion.id);
      if (success) {
        setShowConfirmRestore(false);
        onClose();
        alert("Khôi phục phiên bản thành công!");
      } else {
        alert("Khôi phục thất bại. Vui lòng thử lại.");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối khi khôi phục.");
    } finally {
      setIsRestoring(false);
    }
  }, [selectedVersion, restoreVersion, onClose]);

  const handleDeleteVersion = useCallback(() => {
    if (!selectedVersion) return;
    setShowConfirmDelete(true);
  }, [selectedVersion]);

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedVersion) return;
    setIsDeleting(true);
    try {
      const success = await deleteVersion(selectedVersion.id);
      if (success) {
        setShowConfirmDelete(false);
        fetchVersions();
      } else {
        alert("Xóa phiên bản thất bại. Lưu ý: Không được phép xóa phiên bản mới nhất.");
        setShowConfirmDelete(false);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối khi xóa phiên bản.");
      setShowConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedVersion, deleteVersion, fetchVersions]);

  const isLatest = !!(selectedVersion && versions[0] && selectedVersion.id === versions[0].id);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className={`bg-white border border-slate-100 rounded-3xl w-full h-[600px] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isComparing && isSplitView ? "max-w-6xl" : "max-w-4xl"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-left">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-red-500" />
                Nhật ký phiên bản (10 phiên bản gần nhất)
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">
                Chọn phiên bản để xem chi tiết, hoặc click so sánh với bản gốc AI.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 font-black text-xs px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer"
            >
              Đóng
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left side - List */}
            <div className="w-1/3 border-r border-slate-100 flex flex-col min-h-0 bg-slate-50/10">
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingVersions ? (
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-slate-50 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-[10px] font-bold">
                    Chưa có lịch sử phiên bản nào được lưu.
                  </div>
                ) : (
                  versions.map((v: any, idx: number) => {
                    const isSelected = selectedVersion?.id === v.id;
                    const isCurrentVersion = idx === 0;
                    const dateStr = new Date(v.createdAt).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    });
                    return (
                      <div
                        key={v.id}
                        onClick={() => handleSelectVersion(v)}
                        className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-left space-y-1.5 ${
                          isCurrentVersion
                            ? isSelected
                              ? "border-emerald-300 bg-emerald-50/60 shadow-sm"
                              : "border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60 hover:border-emerald-300"
                            : isSelected
                            ? "border-red-200 bg-red-50/20 shadow-sm"
                            : "border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-black leading-tight ${isCurrentVersion ? "text-emerald-700" : "text-slate-700"}`}>
                            {v.versionName || `Phiên bản #${v.id}`}
                          </span>
                          {isCurrentVersion && (
                            <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500 text-white tracking-wide uppercase">
                              Hiện tại
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 space-y-0.5">
                          <div>
                            Người sửa:{" "}
                            <span className={isCurrentVersion ? "text-emerald-600" : "text-slate-600"}>
                              {v.creator?.name ?? v.creator?.email ?? `User ID: ${v.createdById}`}
                            </span>
                          </div>
                          <div>
                            Thời gian: <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side - Detail Preview / Compare View */}
            <div className="w-2/3 flex flex-col overflow-hidden min-h-0 bg-slate-50/30">
              {isComparing ? (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 p-6">
                  {/* Toolbar inside comparison */}
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="text-left">
                      <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">So sánh thay đổi (Diff)</span>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5">
                        <span className="text-red-500 font-black">{comparedVersions?.v1.versionName || `Phiên bản #${comparedVersions?.v1.id}`}</span>
                        <span className="mx-1.5 text-slate-300 font-normal">➔</span>
                        <span className="text-emerald-600 font-black">{comparedVersions?.v2.versionName || `Phiên bản #${comparedVersions?.v2.id}`}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsSplitView((prev) => !prev)}
                        className="px-3 py-1.5 text-[10px] font-black bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                      >
                        {isSplitView ? "Chế độ 1 cột" : "Chế độ 2 cột"}
                      </button>
                      <button
                        onClick={() => {
                          setIsComparing(false);
                          setDiffResult(null);
                          setComparedVersions(null);
                        }}
                        className="px-3 py-1.5 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-500 rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        Quay lại
                      </button>
                    </div>
                  </div>

                  {/* Diff Content View */}
                  {loadingDiff ? (
                    <div className="flex-1 border border-slate-100 rounded-2xl bg-white p-5 flex items-center justify-center text-slate-400 text-[10px] font-bold gap-2 shadow-inner">
                      <span className="animate-spin text-red-500">
                        <RotateCcw size={20} />
                      </span>
                      <span>Đang phân tích sự khác biệt...</span>
                    </div>
                  ) : diffResult ? (
                    isSplitView ? (
                      /* ----------------------------------------------------
                       * SPLIT VIEW (2 Columns)
                       * ---------------------------------------------------- */
                      <div className="flex-1 flex overflow-hidden min-h-0 gap-4">
                        {/* Left column - Original (Old) */}
                        <div className="w-1/2 flex flex-col min-h-0 border border-slate-100 rounded-2xl bg-white p-4 overflow-y-auto text-left shadow-inner">
                          <div className="text-[9px] font-black text-red-500 border-b border-slate-50 pb-2 mb-2 uppercase tracking-wider flex items-center justify-between">
                            <span>{comparedVersions?.v1.versionName || "PHIÊN BẢN CŨ"}</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[8px] font-bold">CŨ</span>
                          </div>
                          <div className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap font-sans pl-1">
                            {diffResult.map((change, index) => {
                              if (change.type === "REMOVED") {
                                return (
                                  <span
                                    key={index}
                                    className="bg-red-50 text-red-700 line-through px-1 py-0.5 rounded border border-red-200 font-black mx-[1px]"
                                  >
                                    {change.value}
                                  </span>
                                );
                              } else if (change.type === "UNCHANGED") {
                                return <span key={index}>{change.value}</span>;
                              }
                              return null; // Do not show added words in the old version view
                            })}
                          </div>
                        </div>

                        {/* Right column - Selected (New) */}
                        <div className="w-1/2 flex flex-col min-h-0 border border-slate-100 rounded-2xl bg-white p-4 overflow-y-auto text-left shadow-inner">
                          <div className="text-[9px] font-black text-emerald-600 border-b border-slate-50 pb-2 mb-2 uppercase tracking-wider flex items-center justify-between">
                            <span>{comparedVersions?.v2.versionName || "Phiên bản chỉnh sửa"}</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[8px] font-bold">Mới</span>
                          </div>
                          <div className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap font-sans pl-1">
                            {diffResult.map((change, index) => {
                              if (change.type === "ADDED") {
                                return (
                                  <span
                                    key={index}
                                    className="bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded border border-emerald-200 font-black mx-[1px]"
                                  >
                                    {change.value}
                                  </span>
                                );
                              } else if (change.type === "UNCHANGED") {
                                return <span key={index}>{change.value}</span>;
                              }
                              return null; // Do not show removed words in the new version view
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ----------------------------------------------------
                       * UNIFIED VIEW (1 Column)
                       * ---------------------------------------------------- */
                      <div className="flex-1 border border-slate-100 rounded-2xl bg-white p-5 overflow-y-auto text-left min-h-0 shadow-inner">
                        <div className="space-y-4">
                          {/* Legend */}
                          <div className="flex items-center gap-4 text-[9px] font-black border-b border-slate-50 pb-3 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
                              <span className="text-red-500 uppercase tracking-wider">Từ bị xóa</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block"></span>
                              <span className="text-emerald-600 uppercase tracking-wider">Từ thêm mới</span>
                            </div>
                          </div>

                          {/* Diff Render */}
                          <div className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap font-sans pl-1">
                            {diffResult.map((change, index) => {
                              if (change.type === "ADDED") {
                                return (
                                  <span
                                    key={index}
                                    className="bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded border border-emerald-200 font-black mx-[1px]"
                                  >
                                    {change.value}
                                  </span>
                                );
                              } else if (change.type === "REMOVED") {
                                return (
                                  <span
                                    key={index}
                                    className="bg-red-50 text-red-700 line-through px-1 py-0.5 rounded border border-red-200 font-black mx-[1px]"
                                  >
                                    {change.value}
                                  </span>
                                );
                              } else {
                                return <span key={index}>{change.value}</span>;
                              }
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex-1 border border-slate-100 rounded-2xl bg-white p-5 flex items-center justify-center text-slate-400 text-xs font-bold shadow-inner">
                      Không có dữ liệu so sánh.
                    </div>
                  )}
                </div>
              ) : loadingVersionDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 text-xs font-bold gap-2">
                  <span className="animate-spin text-red-500">
                    <RotateCcw size={24} />
                  </span>
                  <span>Đang tải nội dung phiên bản...</span>
                </div>
              ) : selectedVersion ? (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 p-6">
                  {/* Toolbar inside preview */}
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="text-left">
                      <span className="text-[10px] font-black text-slate-700">Chi tiết phiên bản</span>
                      <div className="text-[9px] text-slate-400 font-bold">
                        Được tạo lúc {new Date(selectedVersion.createdAt).toLocaleString("vi-VN")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Compare with Latest button */}
                      <button
                        onClick={handleStartCompareWithLatest}
                        className="p-2 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-sm"
                        title="So sánh phiên bản này với phiên bản mới nhất"
                      >
                        <GitCompare size={16} className="text-red-500" />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => !isLatest && setShowConfirmRestore(true)}
                            disabled={isLatest}
                            className="px-4 py-2 text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-sm shadow-red-500/10 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed border border-transparent disabled:border-slate-200"
                            title={isLatest ? "Đây là phiên bản hiện tại (không cần khôi phục)" : "Khôi phục về phiên bản này"}
                          >
                            Khôi phục phiên bản này
                          </button>
                          <button
                            onClick={() => !isLatest && handleDeleteVersion()}
                            disabled={isLatest}
                            className="px-4 py-2 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 hover:text-red-500 text-slate-600 rounded-xl transition-all shadow-sm cursor-pointer border border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:border-slate-100 disabled:cursor-not-allowed"
                            title={isLatest ? "Đây là phiên bản hiện tại (không được phép xóa)" : "Xóa phiên bản này"}
                          >
                            Xóa phiên bản này
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Scrollable Text View */}
                  <div className="flex-1 border border-slate-100 rounded-2xl bg-white p-4 overflow-y-auto text-left min-h-0 shadow-inner">
                    <div className="space-y-4">
                      {selectedVersion.structuredContent?.segments ? (
                        selectedVersion.structuredContent.segments.map((seg: any) => (
                          <div key={seg.id} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-red-50 text-red-600">
                                {seg.speaker || seg.speakerId}
                              </span>
                              <span className="font-mono text-[8px] text-slate-400 font-bold">
                                {formatDuration(seg.startTime)} → {formatDuration(seg.endTime)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed pl-1 whitespace-pre-wrap break-words">
                              {seg.text || seg.content}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                          {selectedVersion.rawText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 text-xs font-bold gap-2">
                  <Clock size={32} className="text-slate-300" />
                  <span>Chọn một phiên bản từ danh sách bên trái để xem chi tiết và so sánh</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Restore Modal */}
      {showConfirmRestore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <RotateCcw size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Xác nhận khôi phục</h3>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Bạn có chắc chắn muốn khôi phục về phiên bản này? Hành động này sẽ thay thế hoàn toàn bản dịch hiện tại và đồng bộ tới tất cả người dùng khác đang trực tuyến.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={isRestoring}
                onClick={() => setShowConfirmRestore(false)}
                className="flex-1 py-3 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isRestoring}
                onClick={handleConfirmRestore}
                className="flex-1 py-3 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all shadow-md shadow-red-500/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {isRestoring ? "Đang khôi phục..." : "Khôi phục"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Xác nhận xóa phiên bản</h3>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Bạn có chắc chắn muốn xóa phiên bản <span className="text-slate-600">&ldquo;{selectedVersion?.versionName}&rdquo;</span> không? Thao tác này không thể hoàn tác.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={isDeleting}
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-3 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-3 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all shadow-md shadow-red-500/25 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Trash2 size={13} />
                {isDeleting ? "Đang xóa..." : "Xóa phiên bản"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
