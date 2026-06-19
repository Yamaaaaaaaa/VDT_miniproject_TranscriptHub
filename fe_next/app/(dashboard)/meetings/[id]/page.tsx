'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { meetingsApi, usersApi, filesApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { 
  Video, 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  UserPlus, 
  UserMinus, 
  Crown, 
  ExternalLink, 
  X, 
  Save,
  Eye,
  Edit2 
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

interface MeetingMemberResponse {
  id: number;
  meetingId: string;
  userId: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  joinedAt: string;
}

interface UserProfileResponse {
  id: number;
  name: string;
  email: string;
}

interface MeetingDetailInnerProps {
  id: string;
}

function MeetingDetailInner({ id }: MeetingDetailInnerProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Loading & states
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [members, setMembers] = useState<MeetingMemberResponse[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfileResponse[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [meetingsList, setMeetingsList] = useState<any[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  // Form inputs for updating meeting details
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<'CREATING' | 'PROCESSING' | 'COMPLETED'>('CREATING');
  const [audioFileId, setAudioFileId] = useState<string>('');

  // Form inputs for adding a member
  const [newMemberEmail, setNewMemberEmail] = useState<string>('');
  const [newMemberUserId, setNewMemberUserId] = useState<string>('');
  const [newMemberRole, setNewMemberRole] = useState<'HOST' | 'EDITOR' | 'VIEWER'>('VIEWER');

  // Notification Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger' | 'info'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Load meeting metadata, members and user profiles
  const loadInitialData = useCallback(async () => {
    if (!id) {
      setError('Mã cuộc họp không hợp lệ.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [meetingData, membersList, usersList, filesPage, meetingsPage] = await Promise.all([
        meetingsApi.getOne(id, true, false),
        meetingsApi.getMembers(id),
        usersApi.getAll(),
        filesApi.list(0, 100),
        meetingsApi.list(0, 100, false, false)
      ]);

      setMeeting(meetingData);
      setTitle(meetingData.title);
      setDescription(meetingData.description || '');
      setStatus(meetingData.status);
      setAudioFileId(meetingData.audioFileId || '');
      
      setMembers(membersList || []);
      setAllUsersList(usersList || []);
      setFiles(filesPage.content || []);
      setMeetingsList(meetingsPage.content || []);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Không thể tải chi tiết cuộc họp.');
      addToast('danger', 'Lỗi tải chi tiết cuộc họp.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Get all files that are not linked to any other meeting
  const getAvailableFiles = () => {
    const linkedFileIds = new Set(
      meetingsList
        .filter(m => m.id !== id && m.audioFileId)
        .map(m => m.audioFileId)
    );
    return files.filter(f => !linkedFileIds.has(f.id) || f.id === meeting?.audioFileId);
  };

  // Handle meeting detail update
  const handleUpdateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!title.trim()) {
      setActionError('Tiêu đề cuộc họp không được để trống.');
      return;
    }
    if (!audioFileId) {
      setActionError('Vui lòng chọn một tệp ghi âm liên kết.');
      return;
    }

    setSubmitting(true);
    setActionError('');
    try {
      const updated = await meetingsApi.update(id, {
        title: title.trim(),
        description: description.trim(),
        status,
        audioFileId
      });
      addToast('success', 'Đã lưu các thay đổi của cuộc họp thành công!');
      await loadInitialData();
    } catch (err: any) {
      console.error(err);
      setActionError(err.response?.data?.message || err.message || 'Lỗi khi cập nhật chi tiết cuộc họp.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle member addition
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    let targetEmail = newMemberEmail.trim();
    let targetUserId: number | undefined = undefined;

    if (newMemberUserId) {
      targetUserId = parseInt(newMemberUserId, 10);
      const matchedUser = allUsersList.find(u => u.id === targetUserId);
      if (matchedUser) {
        targetEmail = matchedUser.email;
      }
    }

    if (!targetEmail && !targetUserId) {
      setActionError('Vui lòng chọn hoặc nhập Email thành viên.');
      return;
    }

    setMembersLoading(true);
    setActionError('');
    try {
      await meetingsApi.addMember(id, { 
        userId: targetUserId, 
        email: targetEmail || undefined, 
        role: newMemberRole 
      });
      addToast('success', `Đã thêm thành viên vào cuộc họp.`);
      const updatedList = await meetingsApi.getMembers(id);
      setMembers(updatedList || []);
      setNewMemberEmail('');
      setNewMemberUserId('');
    } catch (err: any) {
      console.error(err);
      setActionError(err.response?.data?.message || err.message || 'Có lỗi khi thêm thành viên.');
    } finally {
      setMembersLoading(false);
    }
  };

  // Handle member role update
  const handleUpdateMemberRole = async (targetUserId: number, role: 'HOST' | 'EDITOR' | 'VIEWER') => {
    if (!id) return;
    setMembersLoading(true);
    try {
      await meetingsApi.updateMemberRole(id, targetUserId, role);
      addToast('success', 'Đã cập nhật quyền thành viên.');
      const updatedList = await meetingsApi.getMembers(id);
      setMembers(updatedList || []);
    } catch (err: any) {
      console.error(err);
      addToast('danger', err.response?.data?.message || err.message || 'Lỗi khi cập nhật quyền.');
    } finally {
      setMembersLoading(false);
    }
  };

  // Handle member removal
  const handleRemoveMember = async (targetUserId: number) => {
    if (!id) return;
    if (confirm('Bạn có chắc muốn xóa thành viên này khỏi cuộc họp?')) {
      setMembersLoading(true);
      try {
        await meetingsApi.removeMember(id, targetUserId);
        addToast('success', 'Đã xóa thành viên khỏi cuộc họp.');
        const updatedList = await meetingsApi.getMembers(id);
        setMembers(updatedList || []);
      } catch (err: any) {
        console.error(err);
        addToast('danger', err.response?.data?.message || err.message || 'Lỗi khi xóa thành viên.');
      } finally {
        setMembersLoading(false);
      }
    }
  };

  const handleBack = () => {
    router.push('/meetings');
  };

  const getUserEmail = (userId: number) => {
    const user = allUsersList.find(u => u.id === userId);
    return user ? user.email : `Người dùng ID: ${userId}`;
  };

  const getUserUsername = (userId: number) => {
    const user = allUsersList.find(u => u.id === userId);
    return user ? user.name : 'Chưa rõ';
  };

  const getCreatorLabel = (creatorId: number) => {
    const user = allUsersList.find(u => u.id === creatorId);
    return user ? `${user.name} (${user.email})` : `ID: ${creatorId}`;
  };

  const formatSize = (bytes?: string) => {
    if (!bytes) return 'N/A';
    const numBytes = Number(bytes);
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const currentUserId = parseInt(user?.id ?? "0", 10);
  const currentMember = members.find(m => m.userId === currentUserId);
  const userMeetingRole = currentMember?.role || (meeting?.creatorId === currentUserId ? 'HOST' : undefined);

  const isMember = !!userMeetingRole;
  const canEdit = userMeetingRole === 'HOST' || userMeetingRole === 'EDITOR';

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
      <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
        <button 
          onClick={handleBack}
          className="p-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white hover:bg-slate-50 rounded-full transition-all cursor-pointer flex items-center justify-center w-9 h-9"
          title="Quay lại danh sách"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Video size={22} className="text-red-500" />
            <span>Chi tiết cuộc họp</span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">Xem chi tiết, cập nhật thông tin và quản lý thành viên tham gia cuộc họp</p>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center bg-white border border-slate-100 rounded-3xl p-6 shadow-sm gap-3">
          <Loader2 size={36} className="animate-spin text-red-500" />
          <span className="text-slate-400 text-xs font-bold">Đang tải nội dung chi tiết cuộc họp...</span>
        </div>
      ) : error ? (
        <div className="p-8 bg-red-50 text-red-600 border border-red-100 rounded-3xl text-center max-w-xl mx-auto">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-2" />
          <p className="font-extrabold text-slate-800 text-sm">Không thể tải dữ liệu cuộc họp</p>
          <p className="mt-2 text-xs">{error}</p>
          <button onClick={handleBack} className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer">Quay lại trang danh sách</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Column 1: Meeting Info & Updates (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50">
              <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-50 pb-3 mb-4">
                Thông tin cuộc họp
              </h3>

              {actionError && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-[10px] font-bold mb-4">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleUpdateMeeting} className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên/Tiêu đề cuộc họp *</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    disabled={submitting}
                    required 
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mô tả cuộc họp</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all min-h-[80px]" 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trạng thái cuộc họp *</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    disabled={submitting}
                    required
                  >
                    <option value="CREATING">Khởi tạo (CREATING)</option>
                    <option value="PROCESSING">Đang xử lý (PROCESSING)</option>
                    <option value="COMPLETED">Đã hoàn thành (COMPLETED)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tệp ghi âm liên kết *</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 focus:bg-white transition-all cursor-pointer"
                    value={audioFileId}
                    onChange={e => setAudioFileId(e.target.value)}
                    disabled={submitting}
                    required
                  >
                    <option value="" disabled>-- Chọn tệp ghi âm liên kết --</option>
                    {getAvailableFiles().map(f => (
                      <option key={f.id} value={f.id}>
                        {f.fileName} ({(Number(f.fileSize) / 1024 / 1024).toFixed(2)} MB)
                      </option>
                    ))}
                    {audioFileId && !getAvailableFiles().some(f => f.id === audioFileId) && (
                      <option value={audioFileId} disabled>
                        File liên kết hiện tại đã bị xóa (ID: {audioFileId.slice(0, 8)}...)
                      </option>
                    )}
                  </select>
                </div>

                <div className="border-t border-slate-50 pt-4 flex justify-end">
                  <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer" disabled={submitting}>
                    {submitting ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    <span>Lưu thay đổi</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Audio File Link Card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50">
              <h3 className="text-sm font-extrabold text-slate-800 mb-4">
                Tệp âm thanh ghi âm liên kết
              </h3>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-700 truncate" title={meeting?.audioFile?.fileName}>
                    {meeting?.audioFile?.fileName || 'Không tìm thấy file liên kết'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Dung lượng: {formatSize(meeting?.audioFile?.fileSize)} | Trạng thái: {meeting?.audioFile?.status}
                  </span>
                </div>

                {meeting?.audioFileId && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Nút Xem */}
                    {isMember ? (
                      <Link 
                        href={`/transcripts/${meeting.audioFileId}/view`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer"
                      >
                        <Eye size={12} />
                        <span>Xem</span>
                      </Link>
                    ) : (
                      <button 
                        disabled
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-400 border border-slate-100 text-[10px] font-bold rounded-xl cursor-not-allowed opacity-55 whitespace-nowrap"
                        title="Bạn không phải là thành viên cuộc họp"
                      >
                        <Eye size={12} />
                        <span>Xem</span>
                      </button>
                    )}

                    {/* Nút Chỉnh sửa */}
                    {canEdit ? (
                      <Link 
                        href={`/transcripts/${meeting.audioFileId}/edit`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer shadow-sm shadow-red-500/10"
                      >
                        <Edit2 size={12} />
                        <span>Chỉnh sửa</span>
                      </Link>
                    ) : (
                      <button 
                        disabled
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-400 text-[10px] font-bold rounded-xl cursor-not-allowed opacity-55 whitespace-nowrap"
                        title="Bạn không có quyền chỉnh sửa (Yêu cầu vai trò Host/Editor)"
                      >
                        <Edit2 size={12} />
                        <span>Chỉnh sửa</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 text-[10px] text-slate-400 mt-4 border-t border-slate-50 pt-3">
                <div className="flex justify-between">
                  <span>ID ghi âm:</span>
                  <span className="font-bold text-slate-600">{meeting?.audioFileId}</span>
                </div>
                <div className="flex justify-between">
                  <span>Người khởi tạo cuộc họp:</span>
                  <span className="font-bold text-slate-600">{meeting ? getCreatorLabel(meeting.creatorId) : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngày khởi tạo:</span>
                  <span className="font-bold text-slate-600">{meeting ? new Date(meeting.createdAt).toLocaleString('vi-VN') : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Members Management (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50 flex flex-col gap-4">
              
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-50 pb-3 mb-1">
                  Thành viên cuộc họp ({members.length})
                </h3>
                <p className="text-slate-400 text-[10px]">
                  Quản lý quyền truy cập và vai trò của các thành viên trong cuộc họp này
                </p>
              </div>

              {/* Add member box */}
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                <h4 className="text-xs font-extrabold text-slate-700 mb-3 flex items-center gap-1.5">
                  <UserPlus size={14} className="text-slate-500" />
                  <span>Thêm thành viên mới</span>
                </h4>

                <form onSubmit={handleAddMember} className="flex gap-2.5 items-end flex-wrap">
                  <div className="flex-1 min-w-[160px] flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Chọn user hệ thống</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
                      value={newMemberUserId}
                      onChange={e => {
                        setNewMemberUserId(e.target.value);
                        if (e.target.value) setNewMemberEmail('');
                      }}
                      disabled={membersLoading}
                    >
                      <option value="">-- Chọn thành viên --</option>
                      {allUsersList.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-[120px] flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hoặc Email</label>
                    <input 
                      type="email" 
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 transition-all placeholder:text-slate-300" 
                      placeholder="vd: user@gmail.com"
                      value={newMemberEmail}
                      onChange={e => {
                        setNewMemberEmail(e.target.value);
                        if (e.target.value) setNewMemberUserId('');
                      }}
                      disabled={membersLoading}
                    />
                  </div>

                  <div className="w-24 flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Vai trò</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-red-500 transition-all cursor-pointer"
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value as any)}
                      disabled={membersLoading}
                    >
                      <option value="HOST">Host</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>

                  <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer" disabled={membersLoading}>
                    Thêm
                  </button>
                </form>
              </div>

              {/* Members List */}
              <div className="space-y-2 overflow-y-auto max-h-[350px] min-h-[200px] pr-1">
                {membersLoading && members.length === 0 ? (
                  <div className="h-32 flex items-center justify-center">
                    <Loader2 className="animate-spin text-red-500" size={24} />
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Chưa có thành viên nào được cấp quyền truy cập.
                  </div>
                ) : (
                  members.map((member) => {
                    const email = getUserEmail(member.userId);
                    const username = getUserUsername(member.userId);
                    const initials = username.slice(0, 2).toUpperCase();
                    const isHost = member.role === 'HOST';

                    return (
                      <div 
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl gap-3 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
                            isHost ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isHost ? <Crown size={14} /> : initials}
                          </div>
                          <div className="flex flex-col min-w-0 text-xs">
                            <span className="font-bold text-slate-800 truncate">{username}</span>
                            <span className="text-[10px] text-slate-400 truncate">{email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-[10px] text-slate-700 font-bold focus:outline-none focus:border-red-500 cursor-pointer"
                            value={member.role}
                            onChange={e => handleUpdateMemberRole(member.userId, e.target.value as any)}
                            disabled={membersLoading}
                          >
                            <option value="HOST">Host</option>
                            <option value="EDITOR">Editor</option>
                            <option value="VIEWER">Viewer</option>
                          </select>

                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 border border-slate-100 hover:border-red-100 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                            title="Xóa thành viên"
                            disabled={membersLoading}
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  return <MeetingDetailInner id={unwrappedParams.id} />;
}
