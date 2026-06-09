'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type FileMetadataResponse, type Transcript } from '@/services/api';
import { 
  FileText, 
  RefreshCw,
  FileCheck,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';

function ScriptManagementInner() {
  const searchParams = useSearchParams();
  const fileIdParam = searchParams.get('fileId');
  const router = useRouter();

  // Lists & mapping states
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [files, setFiles] = useState<FileMetadataResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Notification Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Redirect if URL contains search param '?fileId=...'
  useEffect(() => {
    if (fileIdParam) {
      router.replace(`/scripts/${fileIdParam}`);
    }
  }, [fileIdParam, router]);

  // Initial Load of all files and transcripts
  const loadInitialData = async () => {
    setLoading(true);
    setError('');
    try {
      const [allTranscripts, filesPage] = await Promise.all([
        api.getAllTranscripts(),
        api.listFiles(0, 200) // retrieve a large list of user files to map names
      ]);

      setTranscripts(allTranscripts);
      setFiles(filesPage.content || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải danh sách bản dịch.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSelectTranscript = (transcript: Transcript) => {
    if (transcript.status !== 'COMPLETED') {
      addToast('danger', 'Bản dịch đang được xử lý hoặc thất bại, không thể xem chi tiết.');
      return;
    }
    router.push(`/scripts/${transcript.audioFileId}`);
  };

  // Formatting helpers
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Find file details helper
  const getFileForTranscript = (audioFileId: string) => {
    return files.find(f => f.id === audioFileId);
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

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="page-title">Quản lý Bản Dịch (Script)</h2>
          <p className="page-description">Danh sách toàn bộ các văn bản dịch thuật được chuyển đổi bằng công nghệ AI từ file âm thanh</p>
        </div>
        <button onClick={loadInitialData} className="btn btn-secondary" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Tải lại</span>
        </button>
      </div>

      {loading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6rem 2rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          gap: '1rem'
        }}>
          <div className="spin-loader" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải danh sách bản dịch từ máy chủ...</span>
        </div>
      ) : error ? (
        <div style={{
          padding: '2.5rem',
          backgroundColor: 'var(--danger-light)',
          color: 'var(--danger-color)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center'
        }}>
          <p style={{ fontWeight: 600 }}>Có lỗi khi tải dữ liệu:</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={loadInitialData} className="btn btn-danger" style={{ marginTop: '1.25rem' }}>Thử lại</button>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-controls">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Danh sách Script sẵn có ({transcripts.filter(t => t.status === 'COMPLETED').length} bản dịch hoàn tất)
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File âm thanh gốc</th>
                  <th>Trạng Thái Dịch</th>
                  <th>Thời lượng ghi âm</th>
                  <th>Dung Lượng</th>
                  <th>Cập nhật gần nhất</th>
                  <th style={{ textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        <FileText className="table-empty-icon" />
                        <h4 className="table-empty-title">Chưa có bản dịch nào</h4>
                        <p className="table-empty-desc">
                          Các bản dịch tự động sẽ xuất hiện sau khi bạn tải file âm thanh lên hệ thống ở trang Quản lý File.
                        </p>
                        <Link href="/files" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                          Đến trang Quản lý File
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transcripts.map((t) => {
                    const relatedFile = getFileForTranscript(t.audioFileId);
                    const fileName = relatedFile?.fileName || `File ghi âm (${t.audioFileId.slice(0, 8)})`;
                    const fileSize = relatedFile ? formatSize(relatedFile.fileSize) : 'N/A';
                    const fileDuration = relatedFile ? formatTime(relatedFile.durationSeconds) : 'N/A';
                    const isCompleted = t.status === 'COMPLETED';

                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                              backgroundColor: isCompleted ? 'var(--primary-light)' : 'var(--warning-light)',
                              color: isCompleted ? 'var(--primary-color)' : 'var(--warning-color)',
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <FileText size={16} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{fileName}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mã dịch thuật: TRANS-{t.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {t.status === 'COMPLETED' ? (
                            <span className="badge badge-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <FileCheck size={12} />
                              <span>Đã hoàn thành</span>
                            </span>
                          ) : t.status === 'PROCESSING' ? (
                            <span className="badge badge-manager" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fefce8', color: '#b45309' }}>
                              <Loader2 className="spin" size={12} />
                              <span>Đang dịch...</span>
                            </span>
                          ) : (
                            <span className="badge badge-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <AlertCircle size={12} />
                              <span>Thất bại</span>
                            </span>
                          )}
                        </td>
                        <td>{fileDuration}</td>
                        <td>{fileSize}</td>
                        <td>{new Date(t.updatedAt).toLocaleString('vi-VN')}</td>
                        <td style={{ textAlign: 'right' }}>
                          {isCompleted ? (
                            <button 
                              onClick={() => handleSelectTranscript(t)}
                              className="btn btn-primary"
                              style={{ padding: '0.4rem 0.875rem', fontSize: '0.8125rem' }}
                            >
                              Xem văn bản
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.875rem', fontSize: '0.8125rem', opacity: 0.5, cursor: 'not-allowed' }}
                            >
                              Chờ xử lý
                            </button>
                          )}
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

      {/* Internal CSS styles */}
      <style>{`
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

export default function ScriptManagementPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        Đang tải thông tin bản dịch...
      </div>
    }>
      <ScriptManagementInner />
    </Suspense>
  );
}
