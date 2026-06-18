"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { filesApi, transcriptsApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import axios from "axios";
import {
  UploadCloud, FileAudio, Trash2, Play, Pause, Edit2,
  Music, HardDrive, Clock, ChevronLeft, ChevronRight, X,
  CheckCircle2, AlertCircle, Loader2, Volume2, Sparkles, FolderOpen
} from "lucide-react";

export default function FileManagementPage() {
  const { user } = useAuth();
  
  // File metadata lists & state
  const [files, setFiles] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<Record<string, any>>({});
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [size] = useState(8);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);

  // Upload progress & UI states
  const [uploadQueue, setUploadQueue] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Edit filename modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<any | null>(null);
  const [newFileName, setNewFileName] = useState("");

  // Premium audio player state
  const [playingFile, setPlayingFile] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load files metadata
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const [filesData, transcriptsData] = await Promise.all([
        filesApi.list(page, size),
        transcriptsApi.getAll().catch(e => {
          console.warn("Failed to load transcripts:", e);
          return [];
        })
      ]);
      if (filesData) {
        setFiles(filesData.content || []);
        setTotalElements(filesData.totalElements || 0);
        setTotalPages(filesData.totalPages || 1);
      }
      if (transcriptsData) {
        const transcriptsMap: Record<string, any> = {};
        transcriptsData.forEach((t: any) => {
          transcriptsMap[t.audioFileId] = t;
        });
        setTranscripts(transcriptsMap);
      }
    } catch (error) {
      console.error("Không thể tải danh sách tệp tin:", error);
    } finally {
      setLoading(false);
    }
  }, [page, size]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Polling for processing transcripts
  useEffect(() => {
    const processingFiles = Object.values(transcripts).some(t => t?.status === 'PROCESSING');
    if (!processingFiles) return;

    const interval = setInterval(async () => {
      try {
        const allTranscripts = await transcriptsApi.getAll();
        const updatedMap: Record<string, any> = {};
        allTranscripts.forEach((t: any) => {
          updatedMap[t.audioFileId] = t;
        });
        setTranscripts(updatedMap);
      } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái bản dịch:", error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [transcripts]);

  // Kích hoạt dịch tự động thủ công bằng AI
  const handleTriggerTranscription = async (fileId: string) => {
    try {
      // Optimistically set status
      setTranscripts(prev => ({
        ...prev,
        [fileId]: { status: 'PROCESSING', audioFileId: fileId }
      }));
      await transcriptsApi.generate(fileId);
      // Reload to update status in list
      const allTranscripts = await transcriptsApi.getAll();
      const updatedMap: Record<string, any> = {};
      allTranscripts.forEach((t: any) => {
        updatedMap[t.audioFileId] = t;
      });
      setTranscripts(updatedMap);
    } catch (error) {
      console.error("Không thể kích hoạt dịch thuật:", error);
      alert("Kích hoạt dịch thuật thất bại.");
      loadFiles();
    }
  };

  // Audio Player Event Listeners
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Play/Pause toggler
  const togglePlay = (file: any) => {
    if (playingFile && playingFile.id === file.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play().catch(e => console.error(e));
        setIsPlaying(true);
      }
    } else {
      setPlayingFile(file);
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);
      
      // Delay to allow audio tag source to mount
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.volume = volume;
          audioRef.current.play().catch(e => console.error(e));
        }
      }, 50);
    }
  };

  const handlePlayPauseFromBar = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error(e));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  // Drag and Drop files
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
      const droppedFiles = Array.from(e.dataTransfer.files);
      const audioFiles = droppedFiles.filter(file => file.type.startsWith("audio/"));
      if (audioFiles.length === 0) {
        alert("Chỉ chấp nhận các tệp tin âm thanh!");
        return;
      }
      audioFiles.forEach(file => processUpload(file));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFiles = Array.from(e.target.files);
      const audioFiles = selectedFiles.filter(file => file.type.startsWith("audio/"));
      if (audioFiles.length === 0) {
        alert("Chỉ chấp nhận các tệp tin âm thanh!");
        return;
      }
      audioFiles.forEach(file => processUpload(file));
    }
  };

  // Implement the 3-step upload
  const processUpload = async (file: File) => {
    const queueId = Math.random().toString(36).substr(2, 9);
    const newQueueItem = {
      id: queueId,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "initializing"
    };

    setUploadQueue(prev => [newQueueItem, ...prev]);

    try {
      // Step 1: Initialize Upload
      const initRes = await filesApi.initializeUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "audio/mpeg"
      });
      const { fileId, presignedUrl } = initRes;

      setUploadQueue(prev =>
        prev.map(item => (item.id === queueId ? { ...item, status: "uploading" } : item))
      );

      // Step 2: PUT Binary to MinIO directly
      await axios.put(presignedUrl, file, {
        headers: {
          "Content-Type": file.type || "audio/mpeg"
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const percent = Math.round((progressEvent.loaded * 100) / total);
          setUploadQueue(prev =>
            prev.map(item => (item.id === queueId ? { ...item, progress: percent } : item))
          );
        }
      });

      setUploadQueue(prev =>
        prev.map(item => (item.id === queueId ? { ...item, status: "completing", progress: 100 } : item))
      );

      // Step 3: Complete Upload to finalize duration & status
      await filesApi.completeUpload(fileId);

      // Successfully uploaded! Remove from queue and refresh file list
      setUploadQueue(prev => prev.filter(item => item.id !== queueId));
      loadFiles();
    } catch (error) {
      console.error("Lỗi tải tệp lên:", error);
      setUploadQueue(prev =>
        prev.map(item => (item.id === queueId ? { ...item, status: "failed" } : item))
      );
    }
  };

  // Delete file
  const handleDelete = async (fileId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa tệp tin này không? Việc này cũng sẽ xóa file trên bộ nhớ lưu trữ.")) return;
    try {
      await filesApi.delete(fileId);
      alert("Xóa tệp tin thành công!");
      if (playingFile && playingFile.id === fileId) {
        setPlayingFile(null);
        setIsPlaying(false);
      }
      loadFiles();
    } catch (error) {
      console.error(error);
      alert("Xóa tệp tin thất bại. Bạn không đủ quyền.");
    }
  };

  // Open Rename Modal
  const openRenameModal = (file: any) => {
    setEditingFile(file);
    setNewFileName(file.fileName);
    setIsEditModalOpen(true);
  };

  // Submit Rename
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile || !newFileName.trim()) return;

    try {
      await filesApi.updateMetadata(editingFile.id, newFileName.trim());
      alert("Đổi tên tệp tin thành công!");
      setIsEditModalOpen(false);
      loadFiles();
      if (playingFile && playingFile.id === editingFile.id) {
        setPlayingFile({ ...playingFile, fileName: newFileName.trim() });
      }
    } catch (error) {
      console.error(error);
      alert("Đổi tên thất bại.");
    }
  };

  // Formatting helpers
  const formatBytes = (bytes: any, decimals = 2) => {
    const b = Number(bytes);
    if (b === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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

  // Calculate statistics
  const totalFilesCount = totalElements;
  const totalStorageSize = files.reduce((acc, f) => acc + Number(f.fileSize), 0);
  const totalDurationTime = files.reduce((acc, f) => acc + Number(f.durationSeconds || 0), 0);

  return (
    <div className="space-y-8 pb-32">
      {/* 3 Widgets Thống kê */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Widget 1 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-red-50 text-red-500 rounded-2xl shrink-0">
            <HardDrive size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng số tệp</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{totalFilesCount} tệp</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-green-500 bg-green-50 px-1.5 py-0.5 rounded-md mt-1">
              Active Storage
            </span>
          </div>
        </div>

        {/* Widget 2 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-indigo-50 text-indigo-500 rounded-2xl shrink-0">
            <Music size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dung lượng sử dụng</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{formatBytes(totalStorageSize)}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md mt-1">
              MinIO Bucket
            </span>
          </div>
        </div>

        {/* Widget 3 */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-4 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all">
          <div className="p-3.5 bg-blue-50 text-blue-500 rounded-2xl shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng thời lượng</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{formatDuration(totalDurationTime)}</h3>
            <span className="inline-flex items-center text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md mt-1">
              Đã trích xuất
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Vùng Drag Drop Upload (Cột trái) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50">
            <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-red-500 animate-pulse" />
              Tải lên tệp âm thanh mới
            </h3>
            
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-red-500 bg-red-50/30 scale-[0.98]"
                  : "border-slate-200 hover:border-red-500 hover:bg-slate-50/50"
              }`}
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <input
                id="file-upload"
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <UploadCloud size={48} className={`mb-4 transition-all ${dragActive ? "text-red-500" : "text-slate-400"}`} />
              <p className="text-sm font-bold text-slate-700">Kéo & thả file âm thanh</p>
              <p className="text-xs text-slate-400 mt-1">Hoặc click để chọn tệp tin từ máy</p>
              <span className="inline-block text-[9px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold mt-4">
                MP3, WAV, M4A, OGG
              </span>
            </div>
          </div>

          {/* Hàng đợi Upload (Upload Queue) */}
          {uploadQueue.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Tiến độ tải lên ({uploadQueue.length})
              </h4>
              
              <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                {uploadQueue.map((item) => (
                  <div key={item.id} className="border border-slate-100 rounded-xl p-3.5 space-y-2 bg-slate-50/50 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{formatBytes(item.size)}</p>
                      </div>
                      
                      {/* Trạng thái Status badge */}
                      {item.status === "initializing" && (
                        <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-1.5 py-0.5 font-bold animate-pulse">
                          Khởi tạo...
                        </span>
                      )}
                      {item.status === "uploading" && (
                        <span className="text-[9px] bg-amber-50 text-amber-500 border border-amber-100 rounded-full px-1.5 py-0.5 font-bold">
                          Đang tải lên
                        </span>
                      )}
                      {item.status === "completing" && (
                        <span className="text-[9px] bg-indigo-50 text-indigo-500 border border-indigo-100 rounded-full px-1.5 py-0.5 font-bold animate-pulse">
                          Xử lý...
                        </span>
                      )}
                      {item.status === "failed" && (
                        <span className="text-[9px] bg-red-50 text-red-500 border border-red-100 rounded-full px-1.5 py-0.5 font-bold flex items-center gap-1">
                          <AlertCircle size={10} /> Lỗi
                        </span>
                      )}
                    </div>

                    {/* Thanh phần trăm tiến độ Progress bar */}
                    {item.status === "uploading" && (
                      <div className="space-y-1">
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-end">
                          <span className="text-[9px] font-bold text-slate-400">{item.progress}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Danh sách tệp tin (Cột phải) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <FolderOpen size={18} className="text-red-500" />
                Danh sách tệp tin âm thanh
              </h3>
              <button
                onClick={loadFiles}
                className="text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl px-3 py-1.5 border border-transparent hover:border-red-100 transition-all cursor-pointer"
              >
                Làm mới
              </button>
            </div>

            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={36} className="animate-spin text-red-500" />
                <p className="text-xs font-bold">Đang tải danh sách tệp tin...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
                <FileAudio size={48} className="text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-500">Chưa có tệp tin nào</p>
                <p className="text-xs text-slate-400 mt-1">Kéo thả file ở cột bên trái để tải lên ngay</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2 w-10"></th>
                        <th className="pb-3">Tên file</th>
                        <th className="pb-3">Dung lượng</th>
                        <th className="pb-3">Thời lượng</th>
                        <th className="pb-3">Trạng thái</th>
                        <th className="pb-3">Bản dịch AI</th>
                        <th className="pb-3">Ngày tạo</th>
                        <th className="pb-3 pr-2 text-right">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {files.map((file) => {
                        const isCurrentPlaying = playingFile?.id === file.id;
                        return (
                          <tr key={file.id} className="hover:bg-slate-50/50 transition-all group">
                            <td className="py-3.5 pl-2">
                              {file.status === "READY" ? (
                                <button
                                  onClick={() => togglePlay(file)}
                                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                                    isCurrentPlaying
                                      ? "bg-red-50 text-red-500"
                                      : "bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500"
                                  }`}
                                >
                                  {isCurrentPlaying && isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                </button>
                              ) : (
                                <div className="p-2 bg-slate-50 text-slate-300 rounded-xl">
                                  <Loader2 size={14} className="animate-spin" />
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 font-bold text-slate-800 max-w-[180px] truncate" title={file.fileName}>
                              {file.fileName}
                            </td>
                            <td className="py-3.5 text-slate-500">{formatBytes(file.fileSize)}</td>
                            <td className="py-3.5 text-slate-500 font-bold">{formatDuration(file.durationSeconds)}</td>
                            <td className="py-3.5">
                              {file.status === "READY" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                                  <CheckCircle2 size={10} /> Sẵn sàng
                                </span>
                              )}
                              {file.status === "UPLOADING" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                                  <Loader2 size={10} className="animate-spin" /> Đang tải
                                </span>
                              )}
                              {file.status === "FAILED" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                                  <AlertCircle size={10} /> Lỗi tải
                                </span>
                              )}
                            </td>
                            <td className="py-3.5">
                              {(() => {
                                const transcript = transcripts[file.id];
                                const status = transcript ? transcript.status : "NO_TRANSCRIPT";
                                
                                if (status === "PROCESSING") {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 animate-pulse">
                                      <Loader2 size={10} className="animate-spin" /> Đang dịch...
                                    </span>
                                  );
                                } else if (status === "COMPLETED") {
                                  return (
                                    <Link
                                      href={`/transcripts/${file.id}/view`}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 hover:bg-red-500 hover:text-white rounded-full px-2 py-0.5 transition-all"
                                    >
                                      Xem bản dịch
                                    </Link>
                                  );
                                } else if (status === "FAILED") {
                                  return (
                                    <button
                                      onClick={() => handleTriggerTranscription(file.id)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 hover:bg-red-50 border border-red-200 hover:border-red-300 rounded-full px-2 py-0.5 transition-all cursor-pointer"
                                    >
                                      Thử lại
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      onClick={() => handleTriggerTranscription(file.id)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-full px-2 py-0.5 transition-all cursor-pointer"
                                    >
                                      Dịch AI
                                    </button>
                                  );
                                }
                              })()}
                            </td>
                            <td className="py-3.5 text-slate-400">{formatDate(file.createdAt)}</td>
                            <td className="py-3.5 pr-2 text-right">
                              <div className="flex items-center justify-end gap-1.5 transition-all">
                                <button
                                  onClick={() => openRenameModal(file)}
                                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
                                  title="Đổi tên"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(file.id)}
                                  className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                                  title="Xóa tệp"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                    <p className="text-xs text-slate-500 font-bold">
                      Hiển thị {files.length} trên tổng số {totalElements} tệp tin
                    </p>
                    
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 disabled:hover:border-slate-200 transition-all cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-bold px-3">
                        Trang {page + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page === totalPages - 1}
                        className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 disabled:hover:border-slate-200 transition-all cursor-pointer"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Premium Audio Player Widget (Sticky Bottom) */}
      {playingFile && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:w-[70%] max-w-4xl bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl z-50 flex flex-col md:flex-row items-center gap-4 border border-slate-800 animate-slide-up">
          <audio
            ref={audioRef}
            src={`/api/files/stream/${playingFile.id}`}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleAudioEnded}
            style={{ display: "none" }}
          />

          {/* Left: Info */}
          <div className="flex items-center gap-3 w-full md:w-1/4 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
              <FileAudio size={20} className="animate-pulse" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold truncate pr-2" title={playingFile.fileName}>
                {playingFile.fileName}
              </h4>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">{formatBytes(playingFile.fileSize)}</p>
            </div>
          </div>

          {/* Center: Controls & Time Slider */}
          <div className="flex items-center gap-4 flex-1 w-full">
            {/* Play/Pause Button */}
            <button
              onClick={handlePlayPauseFromBar}
              className="p-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all cursor-pointer shrink-0 shadow-lg shadow-red-500/30"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Current Time */}
            <span className="text-[10px] font-bold text-slate-400 shrink-0 w-8 text-right">
              {formatDuration(Math.round(currentTime))}
            </span>

            {/* Seek Bar */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-red-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />

            {/* Total Duration */}
            <span className="text-[10px] font-bold text-slate-400 shrink-0 w-8">
              {formatDuration(Math.round(duration))}
            </span>
          </div>

          {/* Right: Volume & Close */}
          <div className="flex items-center gap-3.5 w-full md:w-auto justify-end">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-slate-400 shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 accent-red-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            
            <div className="w-px h-6 bg-slate-800" />
            
            <button
              onClick={() => {
                setPlayingFile(null);
                setIsPlaying(false);
              }}
              className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Đổi tên (Rename) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-100 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-base font-extrabold text-slate-800">Đổi tên tệp tin</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-full transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tên tệp tin mới</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Nhập tên tệp..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl shadow-md shadow-red-500/25 transition-all cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
