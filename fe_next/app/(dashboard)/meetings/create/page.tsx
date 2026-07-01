'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { meetingsApi, filesApi } from '@/lib/api';
import { Video, ArrowLeft, Loader2, AlertCircle, CheckCircle2, UploadCloud, List, FileAudio } from 'lucide-react';
import axios from 'axios';

interface FileMetadataResponse {
  id: string;
  fileName: string;
  fileSize: string;
}

export default function MeetingCreate() {
  const router = useRouter();

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [audioFileId, setAudioFileId] = useState<string>('');

  const [files, setFiles] = useState<FileMetadataResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Tab & Upload state variables
  const [activeTab, setActiveTab] = useState<'select' | 'upload'>('select');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'initializing' | 'uploading' | 'completing' | 'success' | 'error'>('idle');
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{ id: string; name: string; size: string } | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const formatBytes = (bytes: any, decimals = 2) => {
    const b = Number(bytes);
    if (b === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const fetchAvailableFiles = async (selectedIdToSet?: string) => {
    try {
      const [filesPage, meetingsPage] = await Promise.all([
        filesApi.list(0, 100),
        meetingsApi.list(0, 100, undefined, false, false)
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
          if (availableFiles.some((f: { id: string; }) => f.id === prev)) return prev;
          return availableFiles[0].id;
        });
      } else {
        setAudioFileId('');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách tệp âm thanh ghi âm.');
    }
  };

  // Fetch available files on mount
  useEffect(() => {
    const init = async () => {
      await fetchAvailableFiles();
      setLoading(false);
    };
    init();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (!droppedFile.type.startsWith("audio/")) {
        setError("Chỉ chấp nhận các tệp tin âm thanh!");
        return;
      }
      processUpload(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.type.startsWith("audio/")) {
        setError("Chỉ chấp nhận các tệp tin âm thanh!");
        return;
      }
      processUpload(selectedFile);
    }
  };

  const processUpload = async (file: File) => {
    setUploadFile(file);
    setUploadProgress(0);
    setUploadStatus('initializing');
    setError('');

    try {
      // Step 1: Initialize Upload
      const initRes = await filesApi.initializeUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "audio/mpeg"
      });
      const { fileId, presignedUrl } = initRes;

      setUploadStatus('uploading');

      // Step 2: PUT Binary to MinIO directly
      await axios.put(presignedUrl, file, {
        headers: {
          "Content-Type": file.type || "audio/mpeg"
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const percent = Math.round((progressEvent.loaded * 100) / total);
          setUploadProgress(percent);
        }
      });

      setUploadStatus('completing');

      // Step 3: Complete Upload to finalize duration & status
      await filesApi.completeUpload(fileId);

      setUploadStatus('success');
      setUploadedFileInfo({
        id: fileId,
        name: file.name,
        size: formatBytes(file.size)
      });

      // Refresh files list and select the newly uploaded file!
      await fetchAvailableFiles(fileId);
    } catch (error: any) {
      console.error("Lỗi tải tệp lên:", error);
      setUploadStatus('error');
      setError(error.response?.data?.message || error.message || 'Lỗi khi tải file lên.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Tiêu đề cuộc họp không được để trống.');
      return;
    }
    if (!audioFileId) {
      setError('Vui lòng chọn một tệp ghi âm liên kết.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await meetingsApi.create({
        title: title.trim(),
        description: description.trim(),
        audioFileId
      });
      setSuccess('Đã khởi tạo cuộc họp thành công!');
      setTimeout(() => {
        router.push('/meetings');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi khởi tạo cuộc họp.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/meetings');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 animate-fade-in">

      {/* Header section */}
      <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
        <button
          onClick={handleCancel}
          className="p-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white hover:bg-slate-50 rounded-full transition-all cursor-pointer flex items-center justify-center w-9 h-9"
          title="Quay lại danh sách"
          type="button"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Video size={22} className="text-red-500" />
            <span>Tạo cuộc họp mới</span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">Lập lịch trình cho cuộc họp mới và liên kết nó với tệp ghi âm có sẵn</p>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center bg-white border border-slate-100 rounded-3xl p-6 shadow-sm gap-3">
          <Loader2 size={36} className="animate-spin text-red-500" />
          <span className="text-slate-400 text-xs font-bold">Đang tải thông tin khởi tạo...</span>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm shadow-slate-100/50">
          {error && (
            <div className="flex items-center gap-2 p-3.5 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-bold mb-6">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3.5 bg-green-50 text-green-600 border border-green-100 rounded-2xl text-xs font-bold mb-6">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tên/Tiêu đề cuộc họp *</label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all placeholder:text-slate-400"
                placeholder="vd: Cuộc họp thảo luận dự án VDT"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Mô tả chi tiết cuộc họp</label>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all placeholder:text-slate-400 min-h-[120px] resize-y"
                placeholder="Nhập mục đích, nội dung tóm tắt của cuộc họp..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tệp ghi âm cuộc họp liên kết *</label>

              {/* Tabs selector */}
              <div className="flex gap-2 p-1 bg-slate-100/80 rounded-2xl w-fit">
                <button
                  type="button"
                  onClick={() => { setActiveTab('select'); setError(''); }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'select'
                      ? 'bg-white text-red-500 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  <List size={14} />
                  <span>Chọn file có sẵn</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('upload'); setError(''); }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'upload'
                      ? 'bg-white text-red-500 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  <UploadCloud size={14} />
                  <span>Tải lên file mới</span>
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'select' ? (
                <div className="space-y-1.5">
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all appearance-none cursor-pointer"
                    value={audioFileId}
                    onChange={e => setAudioFileId(e.target.value)}
                    disabled={submitting}
                    required={activeTab === 'select'}
                  >
                    <option value="" disabled>-- Chọn file ghi âm âm thanh --</option>
                    {files.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.fileName} ({(Number(f.fileSize) / 1024 / 1024).toFixed(2)} MB)
                      </option>
                    ))}
                  </select>
                  {files.length === 0 && (
                    <p className="text-xs text-amber-500 font-bold mt-1">
                      Không tìm thấy file âm thanh trống nào. Vui lòng chuyển sang tab "Tải lên file mới" để tải file.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {uploadStatus === 'idle' || uploadStatus === 'error' ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragActive
                          ? "border-red-500 bg-red-50/30 scale-[0.98]"
                          : "border-slate-200 hover:border-red-500 hover:bg-slate-50/50"
                        }`}
                      onClick={() => document.getElementById("file-upload-meeting")?.click()}
                    >
                      <input
                        id="file-upload-meeting"
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      <UploadCloud size={32} className={`mb-2 transition-all ${dragActive ? "text-red-500" : "text-slate-400"}`} />
                      <p className="text-xs font-bold text-slate-700">Kéo & thả file ghi âm vào đây</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Hoặc click để chọn file từ máy</p>
                      <span className="inline-block text-[9px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold mt-2">
                        MP3, WAV, M4A, OGG
                      </span>
                    </div>
                  ) : uploadStatus === 'success' && uploadedFileInfo ? (
                    <div className="border border-green-100 bg-green-50/30 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-600 shrink-0">
                          <CheckCircle2 size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{uploadedFileInfo.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">{uploadedFileInfo.size}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadStatus('idle');
                          setUploadedFileInfo(null);
                          setAudioFileId('');
                        }}
                        className="text-[10px] text-red-500 hover:bg-red-50 rounded-lg px-2.5 py-1.5 font-bold transition-all border border-transparent hover:border-red-100"
                      >
                        Tải file khác
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-100 bg-slate-50/50 rounded-2xl p-4 space-y-2 relative overflow-hidden">
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

              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Cuộc họp của bạn sẽ kết nối trực tiếp với file âm thanh này để hiển thị Script/Bản dịch tương ứng sau khi hoàn tất.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-50">
              <button
                type="button"
                className="px-4 py-2.5 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                onClick={handleCancel}
                disabled={submitting || uploadStatus === 'initializing' || uploadStatus === 'uploading' || uploadStatus === 'completing'}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                disabled={submitting || !audioFileId || uploadStatus === 'initializing' || uploadStatus === 'uploading' || uploadStatus === 'completing'}
              >
                {(submitting || uploadStatus === 'initializing' || uploadStatus === 'uploading' || uploadStatus === 'completing') && <Loader2 className="animate-spin" size={14} />}
                <span>Khởi tạo cuộc họp</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
