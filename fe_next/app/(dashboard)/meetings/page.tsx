'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { meetingsApi, usersApi } from '@/lib/api';
import { 
  Video, 
  Plus, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  X, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';

interface MeetingResponse {
  id: string;
  title: string;
  description?: string;
  creatorId: number;
  audioFileId: string;
  status: 'CREATING' | 'PROCESSING' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  audioFile?: {
    id: string;
    fileName: string;
    fileSize: string;
    mimeType: string;
    durationSeconds: number;
    status: string;
    uploaderId: number;
    createdAt: string;
  };
}

interface UserProfileResponse {
  id: number;
  name: string;
  email: string;
}

export default function MeetingManagement() {
  const router = useRouter();
  
  const [meetings, setMeetings] = useState<MeetingResponse[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfileResponse[]>([]);
  
  const [page, setPage] = useState<number>(0);
  const [size] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [activeMeeting, setActiveMeeting] = useState<MeetingResponse | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger' | 'info'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Fetch meetings page and users
  const fetchMeetings = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const meetingsPage = await meetingsApi.list(page, size, true, false);
      setMeetings(meetingsPage.content || []);
      setTotalPages(meetingsPage.totalPages || 0);
      setTotalElements(meetingsPage.totalElements || 0);

      const usersData = await usersApi.getAll();
      setAllUsersList(usersData || []);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách cuộc họp.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, size]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleOpenCreate = () => {
    router.push('/meetings/create');
  };

  const handleOpenDetail = (meetingId: string) => {
    router.push(`/meetings/${meetingId}`);
  };

  // Handle Open Delete Modal
  const handleOpenDelete = (meeting: MeetingResponse) => {
    setActionError('');
    setActiveMeeting(meeting);
    setShowDeleteModal(true);
  };

  const handleDeleteMeeting = async () => {
    if (!activeMeeting) return;
    setLoading(true);
    setActionError('');
    try {
      await meetingsApi.delete(activeMeeting.id);
      setShowDeleteModal(false);
      addToast('success', 'Đã xóa cuộc họp thành công!');
      fetchMeetings(true);
    } catch (err: any) {
      console.error(err);
      setActionError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi xóa cuộc họp.');
    } finally {
      setLoading(false);
    }
  };

  const getCreatorLabel = (creatorId: number) => {
    const user = allUsersList.find(u => u.id === creatorId);
    return user ? `${user.name} (${user.email})` : `ID: ${creatorId}`;
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      
      {/* Toast notifications */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`flex items-center justify-between gap-4 p-4 rounded-2xl shadow-lg border-l-4 min-w-[300px] transition-all ${
              toast.type === 'success' ? 'bg-green-50 text-green-800 border-green-500' : 
              toast.type === 'danger' ? 'bg-red-50 text-red-800 border-red-500' : 
              'bg-blue-50 text-blue-800 border-blue-500'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{toast.message}</span>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} 
              className="text-inherit hover:opacity-75 transition-all cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header section */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Quản lý cuộc họp</h2>
          <p className="text-slate-400 text-xs mt-1">Lập lịch trình, quản lý thành viên tham gia cuộc họp và kết nối trực tiếp với tài liệu dịch thuật</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => fetchMeetings(true)} 
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white hover:bg-slate-50 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50" 
            disabled={loading}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
          <button 
            onClick={handleOpenCreate} 
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Tạo cuộc họp</span>
          </button>
        </div>
      </div>

      {loading && meetings.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white border border-slate-100 rounded-3xl p-6 shadow-sm gap-3">
          <Loader2 size={36} className="animate-spin text-red-500" />
          <span className="text-slate-400 text-xs font-bold">Đang tải danh sách cuộc họp...</span>
        </div>
      ) : error ? (
        <div className="p-8 bg-red-50 text-red-600 border border-red-100 rounded-3xl text-center">
          <p className="font-extrabold">Có lỗi khi tải dữ liệu cuộc họp:</p>
          <p className="mt-2 text-xs">{error}</p>
          <button onClick={() => fetchMeetings(false)} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-xl font-bold text-xs cursor-pointer hover:bg-red-600">Thử lại</button>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Có tất cả {totalElements} cuộc họp
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Tên cuộc họp</th>
                  <th className="pb-3">File liên kết</th>
                  <th className="pb-3">Người tạo</th>
                  <th className="pb-3">Trạng Thái</th>
                  <th className="pb-3">Ngày tạo</th>
                  <th className="pb-3 pr-2 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {meetings.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="py-16 text-center flex flex-col items-center justify-center text-slate-400">
                        <Video size={48} className="text-slate-300 mb-2" />
                        <h4 className="font-extrabold text-slate-700">Chưa có cuộc họp nào</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">
                          Hãy tạo cuộc họp đầu tiên để liên kết các tệp ghi âm cuộc hội thoại và quản lý thành viên truy cập.
                        </p>
                        <button onClick={handleOpenCreate} className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl cursor-pointer">
                          Tạo cuộc họp ngay
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  meetings.map((m) => {
                    const audioFileName = m.audioFile?.fileName || 'Không tìm thấy file';
                    
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-all group">
                        <td className="py-3.5 pl-2">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{m.title}</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                              {m.description || 'Không có mô tả'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700">{audioFileName}</span>
                            <span className="text-[10px] text-slate-400">ID: {m.audioFileId.slice(0, 8)}...</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-slate-600">
                          {getCreatorLabel(m.creatorId)}
                        </td>
                        <td className="py-3.5">
                          {m.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                              <CheckCircle2 size={10} />
                              <span>Hoàn tất</span>
                            </span>
                          ) : m.status === 'PROCESSING' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 animate-pulse">
                              <Loader2 className="animate-spin" size={10} />
                              <span>Đang xử lý</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                              Khởi tạo
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-slate-400">
                          {new Date(m.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 pr-2 text-right">
                          <div className="flex justify-end gap-1.5 transition-all">
                            {m.audioFileId && m.status === 'COMPLETED' && (
                              <Link 
                                href={`/transcripts/${m.audioFileId}`}
                                className="flex items-center gap-1 px-2.5 py-1 border border-red-100 text-red-500 hover:bg-red-500 hover:text-white rounded-lg font-bold transition-all"
                                title="Xem bản dịch text & timeline âm thanh"
                              >
                                <ExternalLink size={12} />
                                <span>Script</span>
                              </Link>
                            )}
                            
                            <button 
                              onClick={() => handleOpenDetail(m.id)}
                              className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-bold transition-all cursor-pointer"
                              title="Xem chi tiết & Quản lý thành viên"
                            >
                              <Info size={12} />
                              <span>Chi tiết</span>
                            </button>

                            <button 
                              onClick={() => handleOpenDelete(m)}
                              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                              title="Xóa cuộc họp"
                            >
                              <Trash2 size={14} />
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
          {totalElements > 0 && (
            <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-2">
              <span className="text-xs text-slate-400 font-bold">
                Trang {page + 1} / {totalPages}
              </span>
              <div className="flex gap-1">
                <button 
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 transition-all cursor-pointer"
                  disabled={page === 0}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                  className="p-1.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 disabled:opacity-40 transition-all cursor-pointer"
                  disabled={page === totalPages - 1}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete modal overlay */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <h3 className="text-sm font-extrabold text-red-500">Xác nhận xóa cuộc họp</h3>
              <button 
                onClick={() => setShowDeleteModal(false)} 
                className="p-1 text-slate-400 hover:bg-slate-50 rounded-full transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Bạn có chắc chắn muốn xóa cuộc họp <strong>"{activeMeeting?.title}"</strong> không? 
              </p>
              <p className="text-[10px] text-slate-400 leading-normal">
                Hành động này sẽ xóa vĩnh viễn thông tin lịch trình cuộc họp và quyền truy cập của các thành viên. Tệp ghi âm liên kết và bản dịch gốc sẽ không bị ảnh hưởng.
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-bold">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-50 pt-4">
              <button 
                type="button" 
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer" 
                onClick={() => setShowDeleteModal(false)}
              >
                Hủy bỏ
              </button>
              <button 
                type="button" 
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer" 
                onClick={handleDeleteMeeting} 
                disabled={loading}
              >
                {loading && <Loader2 className="animate-spin" size={14} />}
                <span>Xóa vĩnh viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
