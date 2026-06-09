'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, type FileMetadataResponse } from '@/services/api';
import { Video, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  // Fetch available files on mount
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const filesPage = await api.listFiles(0, 100);
        setFiles(filesPage.content || []);
        if (filesPage.content && filesPage.content.length > 0) {
          setAudioFileId(filesPage.content[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Không thể tải danh sách tệp âm thanh ghi âm.');
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []);

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
      await api.createMeeting(title.trim(), description.trim(), audioFileId);
      setSuccess('Đã khởi tạo cuộc họp thành công!');
      setTimeout(() => {
        router.push('/meetings');
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Có lỗi xảy ra khi khởi tạo cuộc họp.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/meetings');
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', minHeight: 'calc(100vh - 110px)', position: 'relative' }}>
      
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button 
          onClick={handleCancel}
          className="btn btn-secondary"
          style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center' }}
          title="Quay lại danh sách"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Video size={24} />
            <span>Tạo cuộc họp mới</span>
          </h2>
          <p className="page-description">Lập lịch trình cho cuộc họp mới và liên kết nó với tệp ghi âm có sẵn</p>
        </div>
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
          height: 'calc(100vh - 200px)'
        }}>
          <div className="spin-loader" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải thông tin khởi tạo...</span>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem' }}>
          {error && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              backgroundColor: 'var(--danger-light)', 
              color: 'var(--danger-color)', 
              fontSize: '0.875rem', 
              border: '1px solid rgba(239, 68, 68, 0.2)',
              marginBottom: '1.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              backgroundColor: 'var(--success-light)', 
              color: 'var(--success-color)', 
              fontSize: '0.875rem', 
              border: '1px solid rgba(34, 197, 94, 0.2)',
              marginBottom: '1.5rem'
            }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Tên/Tiêu đề cuộc họp *</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="vd: Cuộc họp thảo luận dự án VDT"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={submitting}
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Mô tả chi tiết cuộc họp</label>
              <textarea 
                className="form-input" 
                placeholder="Nhập mục đích, nội dung tóm tắt của cuộc họp..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={submitting}
                style={{ minHeight: '100px', resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Tệp ghi âm cuộc họp liên kết *</label>
              <select 
                className="form-input"
                value={audioFileId}
                onChange={e => setAudioFileId(e.target.value)}
                disabled={submitting}
                required
              >
                <option value="" disabled>-- Chọn file ghi âm âm thanh --</option>
                {files.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.fileName} ({(f.fileSize / 1024 / 1024).toFixed(2)} MB)
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem', lineHeight: '1.4' }}>
                Cuộc họp của bạn sẽ kết nối trực tiếp với file âm thanh này để hiển thị Script/Bản dịch tương ứng sau khi hoàn tất. Nếu chưa có file nào, vui lòng sang trang <strong>Quản lý File</strong> để tải lên trước.
              </p>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '1.5rem',
              marginTop: '1rem'
            }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleCancel}
                disabled={submitting}
              >
                Hủy bỏ
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={submitting}
              >
                {submitting && <Loader2 className="spin" size={14} />}
                <span>Khởi tạo cuộc họp</span>
              </button>
            </div>
          </form>
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
      `}</style>
    </div>
  );
}
