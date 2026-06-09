'use client';

import React, { useState, useEffect, useRef, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { api, type FileMetadataResponse, type Transcript, type TranscriptSegment } from '@/services/api';
import { 
  Search, 
  Play, 
  Pause, 
  Download, 
  Volume2, 
  VolumeX, 
  Users, 
  ArrowLeft,
  SearchCode,
  FileJson,
  FileCheck,
  AlertCircle,
  X
} from 'lucide-react';

interface ScriptDetailInnerProps {
  fileId: string;
}

function ScriptDetailInner({ fileId }: ScriptDetailInnerProps) {
  const router = useRouter();

  // Detail view state
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [associatedFile, setAssociatedFile] = useState<FileMetadataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Search filter within segments
  const [segmentFilter, setSegmentFilter] = useState<string>('');
  
  // Audio Playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Notification Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Load transcript and file metadata on mount/fileId change
  useEffect(() => {
    const loadData = async () => {
      if (!fileId) {
        setError('Mã file không hợp lệ.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const [transcript, fileInfo] = await Promise.all([
          api.getTranscript(fileId),
          api.getFile(fileId)
        ]);

        if (transcript.status !== 'COMPLETED') {
          throw new Error('Bản dịch chưa hoàn tất hoặc bị lỗi, không thể xem chi tiết.');
        }

        setSelectedTranscript(transcript);
        setAssociatedFile(fileInfo);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Không thể tải chi tiết bản dịch.');
        addToast('danger', err.message || 'Không thể tải chi tiết bản dịch.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileId]);

  // Parse structuredContent segments safely
  const segmentsList = useMemo((): TranscriptSegment[] => {
    if (!selectedTranscript) return [];
    
    let content = selectedTranscript.structuredContent;
    
    // If it's a string, try to parse it
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        return parsed.segments || [];
      } catch (e) {
        console.error('Failed to parse structuredContent string:', e);
        return [];
      }
    }
    
    // If it is already parsed (as TranscriptContent object)
    if (content && Array.isArray(content.segments)) {
      return content.segments;
    }

    return [];
  }, [selectedTranscript]);

  // Compute active segment based on current audio timestamp
  const activeSegmentId = useMemo(() => {
    if (segmentsList.length === 0 || currentTime === 0) return null;
    
    const active = segmentsList.find(seg => 
      currentTime >= seg.startTime && currentTime <= seg.endTime
    );
    
    return active ? active.id : null;
  }, [segmentsList, currentTime]);

  // Auto-scroll active segment into view in the timeline panel
  useEffect(() => {
    if (activeSegmentId) {
      const el = segmentRefs.current[activeSegmentId];
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [activeSegmentId]);

  // Filter segments by search keyword
  const filteredSegments = useMemo(() => {
    if (!segmentFilter.trim()) return segmentsList;
    const q = segmentFilter.toLowerCase().trim();
    return segmentsList.filter(seg => 
      seg.text.toLowerCase().includes(q) || 
      (seg.speaker && seg.speaker.toLowerCase().includes(q))
    );
  }, [segmentsList, segmentFilter]);

  // Audio Playback Events
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(e => {
          console.error("Audio playback error:", e);
          addToast('danger', 'Không thể phát âm thanh của tệp này.');
        });
    }
  };

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

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSegmentClick = (startTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      if (!isPlaying) {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(e => console.error(e));
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = vol === 0;
    }
  };

  const handleToggleMute = () => {
    const muted = !isMuted;
    setIsMuted(muted);
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  };

  // Formatting helpers
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadTxt = () => {
    if (!selectedTranscript || !associatedFile) return;
    
    let textContent = `BẢN DỊCH VĂN BẢN: ${associatedFile.fileName}\n`;
    textContent += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    textContent += `========================================================\n\n`;

    if (segmentsList.length > 0) {
      segmentsList.forEach(seg => {
        const timeline = `[${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}]`;
        textContent += `${timeline} ${seg.speaker || 'Người nói'}: ${seg.text}\n\n`;
      });
    } else {
      textContent += selectedTranscript.rawText || 'Không có nội dung.';
    }

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${associatedFile.fileName.replace(/\.[^/.]+$/, "")}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Đã tải xuống bản dịch dạng văn bản (.txt) thành công.');
  };

  const downloadJson = () => {
    if (!selectedTranscript || !associatedFile) return;
    
    const exportData = {
      fileId: associatedFile.id,
      fileName: associatedFile.fileName,
      durationSeconds: associatedFile.durationSeconds,
      fileSize: associatedFile.fileSize,
      transcriptId: selectedTranscript.id,
      rawText: selectedTranscript.rawText,
      segments: segmentsList,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${associatedFile.fileName.replace(/\.[^/.]+$/, "")}_transcript.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Đã tải xuống cấu trúc dữ liệu bản dịch (.json) thành công.');
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>;
    
    const parts = text.split(new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() 
            ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', padding: '0.125rem 0.25rem', borderRadius: '2px', fontWeight: 600 }}>{part}</mark>
            : part
        )}
      </span>
    );
  };

  const handleBackToList = () => {
    router.push('/scripts');
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', minHeight: 'calc(100vh - 110px)', position: 'relative' }}>
      
      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {toasts.map(toast => (
          <div 
            key={toast.id}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              backgroundColor: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: toast.type === 'success' ? '#166534' : '#991b1b',
              borderLeft: `5px solid ${toast.type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              minWidth: '280px',
              animation: 'slideIn 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              {toast.type === 'success' ? <FileCheck size={16} /> : <AlertCircle size={16} />}
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

      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8rem 2rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          gap: '1rem',
          height: 'calc(100vh - 150px)'
        }}>
          <div className="spin-loader" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải nội dung chi tiết bản dịch...</span>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--danger-color)', backgroundColor: 'var(--danger-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>Lỗi tải chi tiết bản dịch</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={handleBackToList} className="btn btn-secondary" style={{ marginTop: '1.5rem' }}>Quay lại trang danh sách</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
          
          {/* Detail header toolbar */}
          <div className="card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                onClick={handleBackToList}
                className="btn btn-secondary"
                style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center' }}
                title="Quay lại danh sách"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{associatedFile?.fileName || 'Chi tiết bản dịch'}</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                  Thời lượng: {formatTime(associatedFile?.durationSeconds || 0)} | Dung lượng: {formatSize(associatedFile?.fileSize)}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={downloadTxt}
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <Download size={14} />
                <span>Xuất TXT</span>
              </button>
              <button 
                onClick={downloadJson}
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <FileJson size={14} />
                <span>Xuất JSON</span>
              </button>
            </div>
          </div>

          {/* Split Panel Layout */}
          <div style={{ display: 'flex', flex: 1, gap: '1.25rem', overflow: 'hidden', minHeight: 0 }}>
            
            {/* Left Panel: Audio Controller & search info */}
            <div style={{ width: '340px', display: 'flex', flexDirection: 'column', gap: '1.25rem', flexShrink: 0 }}>
              
              {/* Audio Player Card */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trình Phát Audio</h4>
                
                <div style={{ 
                  padding: '1.25rem', 
                  borderRadius: 'var(--radius-lg)', 
                  backgroundColor: 'var(--bg-main)', 
                  border: '1px solid var(--border-color)',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem'
                }}>
                  <audio 
                    ref={audioRef}
                    src={associatedFile ? `http://localhost:8080/api/v1/files/stream/${associatedFile.id}` : undefined}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={handleAudioEnded}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <input 
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      style={{
                        width: '100%',
                        accentColor: 'var(--primary-color)',
                        cursor: 'pointer',
                        height: '4px',
                        borderRadius: '4px'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <button 
                      onClick={handlePlayPause}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: '2px' }} />}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={handleToggleMute}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <input 
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        style={{
                          width: '70px',
                          accentColor: 'var(--text-muted)',
                          cursor: 'pointer',
                          height: '3px'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Số phân đoạn (Segments):</span>
                    <strong style={{ color: 'var(--text-main)' }}>{segmentsList.length}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Tổng số từ (Ước lượng):</span>
                    <strong style={{ color: 'var(--text-main)' }}>{selectedTranscript?.rawText?.split(/\s+/).length || 0} từ</strong>
                  </div>
                </div>
              </div>

              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tìm kiếm từ khóa</h4>
                
                <div className="search-container" style={{ maxWidth: '100%', border: '1px solid var(--border-color)' }}>
                  <Search className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Tìm từ/câu nói trong bản dịch..."
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value)}
                    className="search-input"
                  />
                  {segmentFilter && (
                    <button 
                      onClick={() => setSegmentFilter('')} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-light)', cursor: 'pointer', display: 'flex' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {segmentFilter && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 600 }}>
                    Khớp {filteredSegments.length} phân đoạn
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', backgroundColor: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <h5 style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>Mẹo xem thông tin:</h5>
                  Nhấp chuột vào bất kỳ phân đoạn văn bản nào ở khung bên phải để di chuyển trình phát nhạc tới mốc thời gian đó và phát trực tiếp.
                </div>
              </div>
            </div>

            {/* Right Panel: Scrollable script timeline */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexShrink: 0 }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Dòng thời gian cuộc trò chuyện (Timeline)</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Màu sắc nổi bật câu đang được phát âm thanh</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
                {filteredSegments.length === 0 ? (
                  <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-light)' }}>
                    <SearchCode size={32} style={{ margin: '0 auto 0.75rem' }} />
                    <p style={{ fontSize: '0.875rem' }}>Không tìm thấy phân đoạn văn bản nào khớp với bộ lọc.</p>
                  </div>
                ) : (
                  filteredSegments.map((seg) => {
                    const isActive = seg.id === activeSegmentId;
                    
                    return (
                      <div 
                        key={seg.id}
                        ref={(el) => { segmentRefs.current[seg.id] = el; }}
                        onClick={() => handleSegmentClick(seg.startTime)}
                        style={{
                          padding: '1rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid',
                          borderColor: isActive ? 'rgba(37, 99, 235, 0.25)' : 'var(--border-color)',
                          backgroundColor: isActive ? '#f0f6ff' : 'white',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.375rem',
                          boxShadow: isActive ? 'var(--shadow-sm)' : 'none'
                        }}
                        className={`segment-bubble ${isActive ? 'active' : ''}`}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ 
                            fontSize: '0.8125rem', 
                            fontWeight: 700, 
                            color: isActive ? 'var(--primary-color)' : 'var(--text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem'
                          }}>
                            <Users size={12} className="text-muted" />
                            <span>{seg.speaker || 'Người nói'}</span>
                          </span>
                          
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontFamily: 'monospace', 
                            color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
                            backgroundColor: isActive ? 'white' : 'var(--bg-main)',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)'
                          }}>
                            {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                          </span>
                        </div>

                        <p style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-main)', 
                          lineHeight: '1.5',
                          fontWeight: isActive ? 500 : 400
                        }}>
                          {highlightText(seg.text, segmentFilter)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Internal CSS styles */}
      <style>{`
        .segment-bubble {
          border-left: 3px solid transparent !important;
        }
        .segment-bubble:hover {
          background-color: var(--bg-main) !important;
          border-left-color: var(--border-hover) !important;
        }
        .segment-bubble.active {
          border-left-color: var(--primary-color) !important;
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
      `}</style>
    </div>
  );
}

export default function ScriptDetailPage({ params }: { params: Promise<{ fileId: string }> }) {
  const unwrappedParams = use(params);
  return <ScriptDetailInner fileId={unwrappedParams.fileId} />;
}
