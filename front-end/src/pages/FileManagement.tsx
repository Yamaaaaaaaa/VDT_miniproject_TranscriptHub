import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api, type FileMetadataResponse, type Transcript } from '../services/api';
import { 
  UploadCloud, 
  Trash2, 
  Edit2, 
  RefreshCw, 
  Play, 
  Pause, 
  FileAudio, 
  CheckCircle2, 
  X, 
  Loader2, 
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface OutletContextType {
  searchQuery: string;
}

export const FileManagement: React.FC = () => {
  const { searchQuery } = useOutletContext<OutletContextType>();
  
  const [files, setFiles] = useState<FileMetadataResponse[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileMetadataResponse[]>([]);
  const [transcripts, setTranscripts] = useState<Record<string, Transcript>>({});
  
  // Pagination
  const [page, setPage] = useState<number>(0);
  const [size] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Polling tracker for newly uploaded or processing files
  const [activePolls, setActivePolls] = useState<Set<string>>(new Set());

  // Modal States
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [activeFile, setActiveFile] = useState<FileMetadataResponse | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');

  // Audio Player State
  const [playingFile, setPlayingFile] = useState<FileMetadataResponse | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Notification Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger' | 'info'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const fetchFiles = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      // 1. Fetch user's files
      const filesPage = await api.listFiles(page, size);
      setFiles(filesPage.content || []);
      setTotalPages(filesPage.totalPages || 0);
      setTotalElements(filesPage.totalElements || 0);

      // 2. Fetch all transcripts to map status
      const allTranscripts = await api.getAllTranscripts();
      const transcriptsMap: Record<string, Transcript> = {};
      allTranscripts.forEach(t => {
        transcriptsMap[t.audioFileId] = t;
      });
      setTranscripts(transcriptsMap);

      // 3. Scan for any files in PROCESSING status and add to active polls
      const processingIds = (filesPage.content || [])
        .filter(f => {
          const t = transcriptsMap[f.id];
          return t && t.status === 'PROCESSING';
        })
        .map(f => f.id);
      
      if (processingIds.length > 0) {
        setActivePolls(prev => {
          const updated = new Set(prev);
          processingIds.forEach(id => updated.add(id));
          return updated;
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải danh sách tệp tin âm thanh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Trigger load on page change
  useEffect(() => {
    fetchFiles();
  }, [page]);

  // Filter files by search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredFiles(files);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const filtered = files.filter(f => 
      f.fileName.toLowerCase().includes(q) || 
      f.mimeType.toLowerCase().includes(q)
    );
    setFilteredFiles(filtered);
  }, [searchQuery, files]);

  // Polling for processing transcripts
  useEffect(() => {
    if (activePolls.size === 0) return;

    const interval = setInterval(async () => {
      try {
        const allTranscripts = await api.getAllTranscripts();
        const updatedMap: Record<string, Transcript> = {};
        allTranscripts.forEach(t => {
          updatedMap[t.audioFileId] = t;
        });

        // Update local transcripts map
        setTranscripts(prev => ({ ...prev, ...updatedMap }));

        // Check if any of our active polls have finished (COMPLETED or FAILED)
        const stillPolling = new Set(activePolls);
        
        activePolls.forEach(fileId => {
          const t = updatedMap[fileId];
          if (t && (t.status === 'COMPLETED' || t.status === 'FAILED')) {
            stillPolling.delete(fileId);
            const fileName = files.find(f => f.id === fileId)?.fileName || 'Tệp tin';
            
            if (t.status === 'COMPLETED') {
              addToast('success', `Dịch thuật thành công: "${fileName}" đã sẵn sàng!`);
            } else {
              addToast('danger', `Dịch thuật thất bại: Lỗi xử lý âm thanh "${fileName}".`);
            }
          }
        });

        if (stillPolling.size !== activePolls.size) {
          setActivePolls(stillPolling);
        }
      } catch (err) {
        console.error('Lỗi khi polling trạng thái bản dịch:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activePolls, files]);

  // Helper formatting size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper formatting duration
  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // File Upload handling
  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadFile(file);
      }
    };
    input.click();
  };

  const uploadFile = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    setUploadProgress(10);
    setActionError('');

    try {
      // Simulate progressive progress upload bar
      const progressTimer = setInterval(() => {
        setUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 300);

      const uploaded = await api.uploadFile(file);
      clearInterval(progressTimer);
      setUploadProgress(100);

      addToast('success', `Tải lên tệp "${file.name}" thành công! Hệ thống đang xử lý dịch thuật.`);
      
      // Add newly uploaded file to polling
      setActivePolls(prev => {
        const next = new Set(prev);
        next.add(uploaded.id);
        return next;
      });

      // Reload files after a short delay
      setTimeout(() => {
        setUploading(false);
        fetchFiles(true);
      }, 500);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Tải lên tệp tin thất bại.');
      setUploading(false);
    }
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      await uploadFile(file);
    } else {
      addToast('danger', 'Vui lòng chỉ kéo thả tệp âm thanh hợp lệ.');
    }
  };

  // Audio Playback action
  const handlePlayAudio = (file: FileMetadataResponse) => {
    if (playingFile?.id === file.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setPlayingFile(file);
      setIsPlaying(true);
      setAudioCurrentTime(0);
      
      // Load source url through gateway stream endpoint
      const streamUrl = `http://localhost:8080/api/v1/files/stream/${file.id}`;
      
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = streamUrl;
          audioRef.current.load();
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(e => {
              console.error("Audio playback error:", e);
              addToast('danger', 'Không thể phát luồng âm thanh của tệp này.');
              setIsPlaying(false);
            });
        }
      }, 50);
    }
  };

  // Time update event handler
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioCurrentTime(0);
  };

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setAudioCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  // Delete Action
  const handleOpenDelete = (file: FileMetadataResponse) => {
    setActiveFile(file);
    setActionError('');
    setShowDeleteModal(true);
  };

  const handleDeleteFile = async () => {
    if (!activeFile) return;
    setActionError('');
    try {
      await api.deleteFile(activeFile.id);
      
      // If deleted file is currently playing, stop it
      if (playingFile?.id === activeFile.id) {
        audioRef.current?.pause();
        setPlayingFile(null);
        setIsPlaying(false);
      }

      // Remove from polling
      setActivePolls(prev => {
        const next = new Set(prev);
        next.delete(activeFile.id);
        return next;
      });

      addToast('success', `Đã xóa tệp tin "${activeFile.fileName}" thành công.`);
      setShowDeleteModal(false);
      fetchFiles(true);
    } catch (err: any) {
      setActionError(err.message || 'Xóa tệp tin thất bại.');
    }
  };

  // Rename Action
  const handleOpenRename = (file: FileMetadataResponse) => {
    setActiveFile(file);
    setNewFileName(file.fileName);
    setActionError('');
    setShowRenameModal(true);
  };

  const handleRenameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFile || !newFileName.trim()) return;
    setActionError('');

    try {
      await api.renameFile(activeFile.id, newFileName.trim());
      addToast('success', `Đổi tên tệp thành công thành "${newFileName}".`);
      setShowRenameModal(false);
      fetchFiles(true);
    } catch (err: any) {
      setActionError(err.message || 'Đổi tên tệp tin thất bại.');
    }
  };

  // Manual trigger transcript generation if it failed or hasn't started
  const handleManualTranscribe = async (fileId: string, fileName: string) => {
    try {
      await api.generateTranscript(fileId);
      addToast('info', `Đã kích hoạt dịch thuật lại cho tệp "${fileName}".`);
      setActivePolls(prev => {
        const next = new Set(prev);
        next.add(fileId);
        return next;
      });
      fetchFiles(true);
    } catch (err: any) {
      addToast('danger', err.message || 'Không thể kích hoạt dịch thuật.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: playingFile ? '100px' : '0px', position: 'relative' }}>
      
      {/* Toast Notification Container */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {toasts.map(toast => (
          <div 
            key={toast.id}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              backgroundColor: toast.type === 'success' ? '#f0fdf4' : toast.type === 'danger' ? '#fef2f2' : '#ecfeff',
              color: toast.type === 'success' ? '#166534' : toast.type === 'danger' ? '#991b1b' : '#155e75',
              borderLeft: `5px solid ${toast.type === 'success' ? 'var(--success-color)' : toast.type === 'danger' ? 'var(--danger-color)' : 'var(--info-color)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              minWidth: '300px',
              animation: 'slideIn 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              {toast.type === 'success' && <CheckCircle2 size={16} />}
              {toast.type === 'danger' && <AlertCircle size={16} />}
              {toast.type === 'info' && <Clock size={16} />}
              <span>{toast.message}</span>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Hidden audio element */}
      <audio 
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="page-title">Quản lý File Âm Thanh</h2>
          <p className="page-description">Tải lên các bản ghi âm cuộc họp, audio bài giảng để thực hiện chuyển dịch tự động sang văn bản</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={() => fetchFiles(true)} 
            className="btn btn-secondary" 
            disabled={loading || refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Upload Block */}
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: '2px dashed var(--border-hover)',
          borderRadius: 'var(--radius-xl)',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          backgroundColor: uploading ? 'var(--bg-main)' : 'var(--bg-card)',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          transition: 'all var(--transition-normal)',
          marginBottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem'
        }}
        onClick={handleUploadClick}
        className="upload-dropzone"
      >
        {uploading ? (
          <>
            <Loader2 className="spin" size={40} style={{ color: 'var(--primary-color)' }} />
            <div style={{ width: '100%', maxWidth: '280px', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                Đang tải tệp âm thanh lên hệ thống... ({uploadProgress}%)
              </div>
              <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--border-color)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: 'var(--primary-color)', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UploadCloud size={28} />
            </div>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Kéo thả hoặc nhấp để chọn tệp âm thanh</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Hỗ trợ định dạng MP3, WAV, M4A, OGG dung lượng tối đa 100MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Main Files Table */}
      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          gap: '1rem'
        }}>
          <div className="spin-loader" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải danh sách tệp tin...</span>
        </div>
      ) : error ? (
        <div style={{
          padding: '2rem',
          backgroundColor: 'var(--danger-light)',
          color: 'var(--danger-color)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center'
        }}>
          <p style={{ fontWeight: 600 }}>Có lỗi xảy ra:</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={() => fetchFiles()} className="btn btn-danger" style={{ marginTop: '1rem' }}>Thử lại</button>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Danh sách tệp tin ({totalElements} tệp)
            </div>
            {searchQuery && (
              <div style={{ fontSize: '0.875rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                Tìm thấy {filteredFiles.length} kết quả
              </div>
            )}
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Tên Tệp Âm Thanh</th>
                  <th>Dung Lượng</th>
                  <th>Thời Lượng</th>
                  <th>Ngày Tải Lên</th>
                  <th>Trạng Thái Dịch</th>
                  <th style={{ textAlign: 'right' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">
                        <FileAudio className="table-empty-icon" />
                        <h4 className="table-empty-title">Không tìm thấy tệp âm thanh nào</h4>
                        <p className="table-empty-desc">
                          {searchQuery ? 'Không có tệp nào khớp với từ khóa tìm kiếm.' : 'Bạn chưa tải lên tệp âm thanh nào. Hãy kéo thả tệp vào vùng tải lên phía trên.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => {
                    const transcript = transcripts[file.id];
                    const isProcessing = activePolls.has(file.id) || (transcript && transcript.status === 'PROCESSING');
                    const transcriptStatus = transcript ? transcript.status : 'NO_TRANSCRIPT';

                    return (
                      <tr key={file.id}>
                        <td>
                          <button 
                            onClick={() => handlePlayAudio(file)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: playingFile?.id === file.id && isPlaying ? 'var(--primary-color)' : 'var(--primary-light)',
                              color: playingFile?.id === file.id && isPlaying ? 'white' : 'var(--primary-color)',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all var(--transition-fast)'
                            }}
                            title={playingFile?.id === file.id && isPlaying ? "Tạm dừng" : "Nghe Audio"}
                          >
                            {playingFile?.id === file.id && isPlaying ? (
                              <Pause size={14} fill="white" />
                            ) : (
                              <Play size={14} fill="currentColor" style={{ marginLeft: '2px' }} />
                            )}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{file.fileName}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MIME: {file.mimeType}</span>
                          </div>
                        </td>
                        <td>{formatSize(file.fileSize)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)' }}>
                            <Clock size={12} />
                            <span>{formatDuration(file.durationSeconds)}</span>
                          </div>
                        </td>
                        <td>
                          {new Date(file.createdAt).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td>
                          {isProcessing ? (
                            <span className="badge badge-manager" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fefce8', color: '#b45309' }}>
                              <Loader2 className="spin" size={12} />
                              <span>Đang dịch thuật...</span>
                            </span>
                          ) : transcriptStatus === 'COMPLETED' ? (
                            <span className="badge badge-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <CheckCircle2 size={12} />
                              <span>Đã dịch xong</span>
                            </span>
                          ) : transcriptStatus === 'FAILED' ? (
                            <span className="badge badge-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <AlertCircle size={12} />
                              <span>Dịch thất bại</span>
                            </span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                              Chưa có bản dịch
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {transcriptStatus === 'COMPLETED' && (
                              <Link 
                                to={`/scripts/${file.id}`}
                                className="btn btn-secondary"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: 'var(--primary-color)', borderColor: 'var(--primary-light)' }}
                                title="Xem bản dịch văn bản chi tiết"
                              >
                                <ExternalLink size={12} />
                                <span>Xem Script</span>
                              </Link>
                            )}
                            
                            {(transcriptStatus === 'FAILED' || transcriptStatus === 'NO_TRANSCRIPT') && (
                              <button
                                onClick={() => handleManualTranscribe(file.id, file.fileName)}
                                className="btn btn-secondary"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: 'var(--info-color)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
                                title="Kích hoạt tạo lại bản dịch bằng AI"
                              >
                                <span>Dịch lại</span>
                              </button>
                            )}

                            <button 
                              onClick={() => handleOpenRename(file)}
                              className="btn btn-secondary"
                              style={{ padding: '0.375rem', borderRadius: 'var(--radius-md)' }}
                              title="Đổi tên file"
                            >
                              <Edit2 size={12} />
                            </button>

                            <button 
                              onClick={() => handleOpenDelete(file)}
                              className="btn btn-secondary"
                              style={{ padding: '0.375rem', color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                              title="Xóa file khỏi hệ thống"
                            >
                              <Trash2 size={12} />
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
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Trang <strong>{page + 1}</strong> / {totalPages} (Tổng số {totalElements} tệp)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  disabled={page === 0}
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
                >
                  <ChevronLeft size={14} />
                  <span>Trước</span>
                </button>
                <button 
                  onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                  disabled={page === totalPages - 1}
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
                >
                  <span>Sau</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RENAME MODAL */}
      {showRenameModal && activeFile && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Đổi tên tệp âm thanh</h3>
              <button onClick={() => setShowRenameModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', color: 'var(--danger-color)' }}>
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleRenameFile} style={modalFormStyle}>
              <div className="form-group">
                <label className="form-label">Tên tệp mới *</label>
                <input 
                  type="text" 
                  className="form-input"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={modalFooterStyle}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary">
                  Cập nhật tên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {showDeleteModal && activeFile && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={{ ...modalCardStyle, maxWidth: '400px' }}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={20} />
                <span>Xác nhận xóa tệp</span>
              </h3>
              <button onClick={() => setShowDeleteModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', color: 'var(--danger-color)' }}>
                <span>{actionError}</span>
              </div>
            )}

            <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn xóa tệp tin <strong>{activeFile.fileName}</strong>?<br />
              <span style={{ color: 'var(--danger-color)', fontWeight: 600, display: 'block', marginTop: '0.5rem' }}>
                * Hành động này sẽ xóa vĩnh viễn tệp âm thanh và các bản dịch liên quan khỏi hệ thống và dịch vụ lưu trữ đám mây.
              </span>
            </div>

            <div style={modalFooterStyle}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Hủy bỏ
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteFile}>
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Audio Player */}
      {playingFile && (
        <div style={stickyPlayerStyle}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
            gap: '1.5rem',
            padding: '0 1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px', maxWidth: '300px' }}>
              <div style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary-color)',
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <FileAudio size={18} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div 
                  style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  title={playingFile.fileName}
                >
                  {playingFile.fileName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {formatSize(playingFile.fileSize)}
                </div>
              </div>
            </div>

            {/* Play controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                onClick={() => handlePlayAudio(playingFile)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" style={{ marginLeft: '2px' }} />}
              </button>
            </div>

            {/* Progress Slider */}
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {formatDuration(audioCurrentTime)}
              </span>
              <input 
                type="range"
                min={0}
                max={audioDuration || 100}
                value={audioCurrentTime}
                onChange={handleProgressBarChange}
                style={{
                  flex: 1,
                  accentColor: 'var(--primary-color)',
                  cursor: 'pointer',
                  height: '4px',
                  borderRadius: '4px'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {formatDuration(audioDuration)}
              </span>
            </div>

            {/* Close button */}
            <button 
              onClick={() => {
                audioRef.current?.pause();
                setPlayingFile(null);
                setIsPlaying(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className="player-close-btn"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Internal Animation CSS styles */}
      <style>{`
        .upload-dropzone:hover {
          border-color: var(--primary-color) !important;
          background-color: var(--primary-light) !important;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin-loader {
          width: 30px;
          height: 30px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .player-close-btn:hover {
          background-color: var(--bg-main);
          color: var(--text-main) !important;
        }
      `}</style>
    </div>
  );
};

// Modal styles
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.4)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem'
};

const modalCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '460px',
  backgroundColor: 'white',
  boxShadow: 'var(--shadow-lg), 0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  borderRadius: 'var(--radius-xl)',
  padding: '1.75rem',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '0.75rem'
};

const modalCloseBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-light)',
  display: 'flex',
  padding: '0.25rem',
  borderRadius: '50%'
};

const modalFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem'
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  marginTop: '0.5rem'
};

// Sticky bottom audio player style
const stickyPlayerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 'var(--sidebar-width)', // align with content layout
  right: 0,
  height: '76px',
  backgroundColor: 'white',
  borderTop: '1px solid var(--border-color)',
  boxShadow: '0 -4px 10px -1px rgba(0, 0, 0, 0.08)',
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  transition: 'left var(--transition-normal)'
};

export default FileManagement;
