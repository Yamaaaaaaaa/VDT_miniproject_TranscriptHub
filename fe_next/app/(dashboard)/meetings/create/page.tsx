'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { meetingsApi, filesApi } from '@/lib/api';
import { Video, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  // Fetch available files on mount
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const filesPage = await filesApi.list(0, 100);
        const content = filesPage.content || [];
        setFiles(content);
        if (content.length > 0) {
          setAudioFileId(content[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.message || err.message || 'Không thể tải danh sách tệp âm thanh ghi âm.');
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tệp ghi âm cuộc họp liên kết *</label>
              <select 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all appearance-none cursor-pointer"
                value={audioFileId}
                onChange={e => setAudioFileId(e.target.value)}
                disabled={submitting}
                required
              >
                <option value="" disabled>-- Chọn file ghi âm âm thanh --</option>
                {files.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.fileName} ({(Number(f.fileSize) / 1024 / 1024).toFixed(2)} MB)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Cuộc họp của bạn sẽ kết nối trực tiếp với file âm thanh này để hiển thị Script/Bản dịch tương ứng sau khi hoàn tất. Nếu chưa có file nào, vui lòng sang trang <strong>Quản lý File</strong> để tải lên trước.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-6 mt-4">
              <button 
                type="button" 
                className="px-4 py-2.5 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50" 
                onClick={handleCancel}
                disabled={submitting}
              >
                Hủy bỏ
              </button>
              <button 
                type="submit" 
                className="flex items-center gap-1.5 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50" 
                disabled={submitting}
              >
                {submitting && <Loader2 className="animate-spin" size={14} />}
                <span>Khởi tạo cuộc họp</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
