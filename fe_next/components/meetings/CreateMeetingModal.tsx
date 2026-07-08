'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { meetingsApi, filesApi } from '@/lib/api';
import axios from 'axios';
import {
  Video,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Wifi,
  UploadCloud,
  List,
  FileAudio,
  Clock,
  Zap,
} from 'lucide-react';

interface FileMetadataResponse {
  id: string;
  fileName: string;
  fileSize: string;
}

interface CreateMeetingModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateMeetingModal({ onClose, onSuccess }: CreateMeetingModalProps) {
  // Modal tab: 'online' | 'file'
  const [modalTab, setModalTab] = useState<'online' | 'file'>('online');

  // ── "File" tab state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audioFileId, setAudioFileId] = useState('');

  const [files, setFiles] = useState<FileMetadataResponse[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [fileTab, setFileTab] = useState<'select' | 'upload'>('select');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'initializing' | 'uploading' | 'completing' | 'success' | 'error'
  >('idle');
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    id: string;
    name: string;
    size: string;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const formatBytes = (bytes: any, decimals = 2) => {
    const b = Number(bytes);
    if (b === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  };

  const fetchAvailableFiles = useCallback(async (selectedIdToSet?: string) => {
    try {
      const [filesPage, meetingsPage] = await Promise.all([
        filesApi.list(0, 100),
        meetingsApi.list(0, 100, undefined, false, false),
      ]);
      const allFiles = filesPage.content || [];
      const allMeetings = meetingsPage.content || [];
      const linkedFileIds = new Set(
        allMeetings.filter((m: any) => m.audioFileId).map((m: any) => m.audioFileId)
      );
      const availableFiles = allFiles.filter((f: any) => !linkedFileIds.has(f.id));
      setFiles(availableFiles);
      if (selectedIdToSet) {
        setAudioFileId(selectedIdToSet);
      } else if (availableFiles.length > 0) {
        setAudioFileId(prev => {
          if (availableFiles.some((f: { id: string }) => f.id === prev)) return prev;
          return availableFiles[0].id;
        });
      } else {
        setAudioFileId('');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách tệp âm thanh.');
    }
  }, []);

  useEffect(() => {
    fetchAvailableFiles().finally(() => setLoadingFiles(false));
  }, [fetchAvailableFiles]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      if (!f.type.startsWith('audio/')) { setError('Chỉ chấp nhận tệp âm thanh!'); return; }
      processUpload(f);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.type.startsWith('audio/')) { setError('Chỉ chấp nhận tệp âm thanh!'); return; }
      processUpload(f);
    }
  };

  const processUpload = async (file: File) => {
    setUploadFile(file);
    setUploadProgress(0);
    setUploadStatus('initializing');
    setError('');
    try {
      const initRes = await filesApi.initializeUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
      });
      const { fileId, presignedUrl } = initRes;
      setUploadStatus('uploading');
      await axios.put(presignedUrl, file, {
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        onUploadProgress: (pe) => {
          const total = pe.total || file.size;
          setUploadProgress(Math.round((pe.loaded * 100) / total));
        },
      });
      setUploadStatus('completing');
      await filesApi.completeUpload(fileId);
      setUploadStatus('success');
      setUploadedFileInfo({ id: fileId, name: file.name, size: formatBytes(file.size) });
      await fetchAvailableFiles(fileId);
    } catch (err: any) {
      setUploadStatus('error');
      setError(err.response?.data?.message || err.message || 'Lỗi khi tải file lên.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Tiêu đề không được để trống.'); return; }
    if (!audioFileId) { setError('Vui lòng chọn tệp ghi âm liên kết.'); return; }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await meetingsApi.create({ title: title.trim(), description: description.trim(), audioFileId });
      setSuccess('Đã khởi tạo cuộc họp thành công!');
      setTimeout(() => { onSuccess(); onClose(); }, 1400);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi khởi tạo cuộc họp.');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy =
    submitting ||
    uploadStatus === 'initializing' ||
    uploadStatus === 'uploading' ||
    uploadStatus === 'completing';

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-100 shadow-2xl shadow-slate-900/10 flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
              <Video size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Tạo cuộc họp mới</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Chọn hình thức tổ chức cuộc họp phù hợp</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="px-7 pt-5 shrink-0">
          <div className="flex gap-1.5 p-1.5 bg-slate-100/70 rounded-2xl">
            <button
              type="button"
              onClick={() => { setModalTab('online'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${modalTab === 'online'
                ? 'bg-white text-red-500 shadow-sm shadow-slate-200/80'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <Wifi size={13} />
              <span>Tạo cuộc họp trực tuyến</span>
            </button>
            <button
              type="button"
              onClick={() => { setModalTab('file'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${modalTab === 'file'
                ? 'bg-white text-red-500 shadow-sm shadow-slate-200/80'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <FileAudio size={13} />
              <span>Tạo bản ghi cuộc họp</span>
            </button>
          </div>
        </div>

        {/* ── Tab Content (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-7 py-5">

          {/* ───── TAB: Online Meeting (Coming Soon) ───── */}
          {modalTab === 'online' && (
            <div className="flex flex-col items-center justify-center py-4 gap-6">
              {/* Hero card */}
              <div className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-8 text-white text-center shadow-xl shadow-indigo-500/25">
                {/* Decorative blobs */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                    <Wifi size={32} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold tracking-tight">Cuộc họp trực tuyến</h4>
                    <p className="text-sm text-white/75 mt-1 leading-relaxed max-w-xs mx-auto">
                      Tổ chức các buổi họp online có ghi âm tự động &amp; phiên dịch thời gian thực
                    </p>
                  </div>
                </div>
              </div>

              {/* Coming soon badge */}
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full">
                <Sparkles size={13} className="text-amber-500" />
                <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider">
                  Tính năng đang phát triển
                </span>
              </div>

              {/* Feature list */}
              <div className="w-full grid grid-cols-1 gap-3">
                {[
                  {
                    icon: <Zap size={16} className="text-indigo-500" />,
                    title: 'Ghi âm & Phiên dịch tức thì',
                    desc: 'Tự động ghi âm toàn bộ cuộc họp và tạo bản dịch ngay khi kết thúc',
                    bg: 'bg-indigo-50',
                    border: 'border-indigo-100',
                  },
                  {
                    icon: <Clock size={16} className="text-violet-500" />,
                    title: 'Lên lịch & Nhắc nhở thông minh',
                    desc: 'Đặt lịch trước và nhận thông báo nhắc nhở tự động cho các thành viên',
                    bg: 'bg-violet-50',
                    border: 'border-violet-100',
                  },
                  {
                    icon: <Video size={16} className="text-blue-500" />,
                    title: 'Tích hợp phòng họp ảo',
                    desc: 'Tích hợp phòng họp video trực tiếp ngay trong nền tảng TranscriptHub',
                    bg: 'bg-blue-50',
                    border: 'border-blue-100',
                  },
                ].map((feat, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-4 ${feat.bg} border ${feat.border} rounded-2xl`}
                  >
                    <div className="shrink-0 w-8 h-8 rounded-xl bg-white/80 border border-white flex items-center justify-center shadow-sm">
                      {feat.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-slate-800">{feat.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed max-w-sm">
                Trong thời gian chờ đợi, bạn có thể sử dụng tab{' '}
                <button
                  type="button"
                  onClick={() => setModalTab('file')}
                  className="text-red-500 font-bold underline cursor-pointer"
                >
                  Tạo bản ghi cuộc họp
                </button>{' '}
                để tạo cuộc họp từ bản ghi âm có sẵn.
              </p>
            </div>
          )}

          {/* ───── TAB: From Audio File ───── */}
          {modalTab === 'file' && (
            <div>
              {error && (
                <div className="flex items-center gap-2 p-3.5 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-bold mb-5">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 p-3.5 bg-green-50 text-green-600 border border-green-100 rounded-2xl text-xs font-bold mb-5">
                  <CheckCircle2 size={15} />
                  <span>{success}</span>
                </div>
              )}

              {loadingFiles ? (
                <div className="h-56 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={28} className="animate-spin text-red-500" />
                  <span className="text-xs font-bold text-slate-400">Đang tải thông tin...</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Title */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Tên / Tiêu đề cuộc họp <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all placeholder:text-slate-400"
                      placeholder="vd: Cuộc họp thảo luận dự án VDT"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      disabled={isBusy}
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Mô tả chi tiết
                    </label>
                    <textarea
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all placeholder:text-slate-400 min-h-[100px] resize-y"
                      placeholder="Nhập mục đích, nội dung tóm tắt của cuộc họp..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>

                  {/* Audio file */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Tệp ghi âm liên kết <span className="text-red-400">*</span>
                    </label>

                    {/* Sub-tabs */}
                    <div className="flex gap-1.5 p-1 bg-slate-100/80 rounded-2xl w-fit">
                      <button
                        type="button"
                        onClick={() => { setFileTab('select'); setError(''); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${fileTab === 'select'
                          ? 'bg-white text-red-500 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                        <List size={12} />
                        <span>Chọn file có sẵn</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFileTab('upload'); setError(''); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${fileTab === 'upload'
                          ? 'bg-white text-red-500 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                        <UploadCloud size={12} />
                        <span>Tải lên file mới</span>
                      </button>
                    </div>

                    {/* Select tab */}
                    {fileTab === 'select' && (
                      <div className="space-y-1.5">
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all appearance-none cursor-pointer"
                          value={audioFileId}
                          onChange={e => setAudioFileId(e.target.value)}
                          disabled={isBusy}
                          required={fileTab === 'select'}
                        >
                          <option value="" disabled>-- Chọn file ghi âm --</option>
                          {files.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.fileName} ({(Number(f.fileSize) / 1024 / 1024).toFixed(2)} MB)
                            </option>
                          ))}
                        </select>
                        {files.length === 0 && (
                          <p className="text-xs text-amber-500 font-bold">
                            Không tìm thấy file trống. Hãy chuyển sang tab &quot;Tải lên file mới&quot;.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Upload tab */}
                    {fileTab === 'upload' && (
                      <div className="space-y-3">
                        {uploadStatus === 'idle' || uploadStatus === 'error' ? (
                          <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragActive
                              ? 'border-red-500 bg-red-50/30 scale-[0.98]'
                              : 'border-slate-200 hover:border-red-400 hover:bg-slate-50/50'
                              }`}
                            onClick={() => document.getElementById('modal-file-upload')?.click()}
                          >
                            <input
                              id="modal-file-upload"
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={handleFileInput}
                            />
                            <UploadCloud
                              size={28}
                              className={`mb-2 ${dragActive ? 'text-red-500' : 'text-slate-400'}`}
                            />
                            <p className="text-xs font-bold text-slate-700">Kéo &amp; thả file ghi âm vào đây</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Hoặc click để chọn file</p>
                            <span className="inline-block text-[9px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold mt-2">
                              MP3 · WAV · M4A · OGG
                            </span>
                          </div>
                        ) : uploadStatus === 'success' && uploadedFileInfo ? (
                          <div className="border border-green-100 bg-green-50/30 rounded-2xl p-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                                <CheckCircle2 size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{uploadedFileInfo.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{uploadedFileInfo.size}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadStatus('idle');
                                setUploadedFileInfo(null);
                                setAudioFileId('');
                              }}
                              className="text-[10px] text-red-500 hover:bg-red-50 rounded-lg px-2.5 py-1.5 font-bold border border-transparent hover:border-red-100 transition-all"
                            >
                              Tải file khác
                            </button>
                          </div>
                        ) : (
                          <div className="border border-slate-100 bg-slate-50/50 rounded-2xl p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate">{uploadFile?.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  {uploadFile ? formatBytes(uploadFile.size) : ''}
                                </p>
                              </div>
                              {uploadStatus === 'initializing' && (
                                <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-1.5 py-0.5 font-bold animate-pulse">
                                  Khởi tạo...
                                </span>
                              )}
                              {uploadStatus === 'uploading' && (
                                <span className="text-[9px] bg-amber-50 text-amber-500 border border-amber-100 rounded-full px-1.5 py-0.5 font-bold">
                                  Đang tải lên
                                </span>
                              )}
                              {uploadStatus === 'completing' && (
                                <span className="text-[9px] bg-indigo-50 text-indigo-500 border border-indigo-100 rounded-full px-1.5 py-0.5 font-bold animate-pulse">
                                  Xử lý...
                                </span>
                              )}
                            </div>
                            {uploadStatus === 'uploading' && (
                              <div className="space-y-1">
                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <span className="text-[9px] font-bold text-slate-400">{uploadProgress}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Cuộc họp sẽ kết nối trực tiếp với file âm thanh này để hiển thị Script/Bản dịch sau khi hoàn tất.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-50">
                    <button
                      type="button"
                      className="px-4 py-2.5 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      onClick={onClose}
                      disabled={isBusy}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                      disabled={isBusy || !audioFileId}
                    >
                      {isBusy && <Loader2 className="animate-spin" size={13} />}
                      <span>Khởi tạo cuộc họp</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
