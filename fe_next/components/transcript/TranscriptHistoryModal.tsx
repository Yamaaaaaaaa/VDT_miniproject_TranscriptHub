"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, RotateCcw } from "lucide-react";

interface TranscriptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  getVersions: () => Promise<any[]>;
  getVersionDetail: (versionId: number) => Promise<any>;
  restoreVersion: (versionId: number) => Promise<boolean>;
  formatDuration: (seconds: number) => string;
}

export function TranscriptHistoryModal({
  isOpen,
  onClose,
  getVersions,
  getVersionDetail,
  restoreVersion,
  formatDuration,
}: TranscriptHistoryModalProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);
  const [loadingVersionDetail, setLoadingVersionDetail] = useState<boolean>(false);
  const [showConfirmRestore, setShowConfirmRestore] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    setSelectedVersion(null);
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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-100 rounded-3xl max-w-4xl w-full h-[600px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-left">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-red-500" />
                Nhật ký phiên bản (10 phiên bản gần nhất)
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">
                Xem và khôi phục các phiên bản cũ đã lưu của bản dịch.
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
            <div className="w-1/3 border-r border-slate-100 overflow-y-auto p-4 space-y-2">
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
                versions.map((v: any) => {
                  const isSelected = selectedVersion?.id === v.id;
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
                        isSelected
                          ? "border-red-200 bg-red-50/20 shadow-sm"
                          : "border-slate-50 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-black text-slate-700 leading-tight">
                          {v.versionName || `Phiên bản #${v.id}`}
                        </span>
                      </div>
                      <div className="text-[9px] font-bold text-slate-400 space-y-0.5">
                        <div>
                          Người sửa:{" "}
                          <span className="text-slate-600">
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

            {/* Right side - Detail Preview */}
            <div className="w-2/3 flex flex-col overflow-hidden min-h-0 bg-slate-50/30">
              {loadingVersionDetail ? (
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
                    <button
                      onClick={() => setShowConfirmRestore(true)}
                      className="px-4 py-2 text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-sm shadow-red-500/10 cursor-pointer"
                    >
                      Khôi phục phiên bản này
                    </button>
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
                  <span>Chọn một phiên bản từ danh sách bên trái để xem nội dung</span>
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
    </>
  );
}
