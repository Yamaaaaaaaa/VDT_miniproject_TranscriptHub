import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, type MeetingResponse, type MeetingMemberResponse, type UserProfileResponse } from '../services/api';
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
  Save 
} from 'lucide-react';

export const MeetingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Loading & states
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [members, setMembers] = useState<MeetingMemberResponse[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfileResponse[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  // Form inputs for updating meeting details
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<'CREATING' | 'PROCESSING' | 'COMPLETED'>('CREATING');

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
  const loadInitialData = async () => {
    if (!id) {
      setError('Mã cuộc họp không hợp lệ.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Fetch meeting (include audio file info), members, and users list
      const [meetingData, membersList, usersList] = await Promise.all([
        api.getMeeting(id, true, false),
        api.getMeetingMembers(id),
        api.getAllUsers()
      ]);

      setMeeting(meetingData);
      setTitle(meetingData.title);
      setDescription(meetingData.description || '');
      setStatus(meetingData.status);
      
      setMembers(membersList);
      setAllUsersList(usersList);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải chi tiết cuộc họp.');
      addToast('danger', 'Lỗi tải chi tiết cuộc họp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [id]);

  // Handle meeting detail update
  const handleUpdateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!title.trim()) {
      setActionError('Tiêu đề cuộc họp không được để trống.');
      return;
    }

    setSubmitting(true);
    setActionError('');
    try {
      const updated = await api.updateMeeting(id, title.trim(), description.trim(), status);
      setMeeting(updated);
      addToast('success', 'Đã lưu các thay đổi của cuộc họp thành công!');
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Lỗi khi cập nhật chi tiết cuộc họp.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle member addition
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    let targetEmail = newMemberEmail.trim();
    if (!targetEmail && newMemberUserId) {
      const matchedUser = allUsersList.find(u => u.id === parseInt(newMemberUserId));
      if (matchedUser) {
        targetEmail = matchedUser.email;
      }
    }

    if (!targetEmail) {
      setActionError('Vui lòng chọn hoặc nhập Email thành viên.');
      return;
    }

    setMembersLoading(true);
    setActionError('');
    try {
      await api.addMeetingMemberByEmail(id, targetEmail, newMemberRole);
      addToast('success', `Đã thêm thành viên ${targetEmail} vào cuộc họp.`);
      // Reload member list
      const updatedList = await api.getMeetingMembers(id);
      setMembers(updatedList);
      setNewMemberEmail('');
      setNewMemberUserId('');
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Có lỗi khi thêm thành viên.');
    } finally {
      setMembersLoading(false);
    }
  };

  // Handle member role update
  const handleUpdateMemberRole = async (targetUserId: number, role: 'HOST' | 'EDITOR' | 'VIEWER') => {
    if (!id) return;
    setMembersLoading(true);
    try {
      await api.updateMeetingMemberRole(id, targetUserId, role);
      addToast('success', 'Đã cập nhật quyền thành viên.');
      const updatedList = await api.getMeetingMembers(id);
      setMembers(updatedList);
    } catch (err: any) {
      console.error(err);
      addToast('danger', err.message || 'Lỗi khi cập nhật quyền.');
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
        await api.removeMeetingMember(id, targetUserId);
        addToast('success', 'Đã xóa thành viên khỏi cuộc họp.');
        const updatedList = await api.getMeetingMembers(id);
        setMembers(updatedList);
      } catch (err: any) {
        console.error(err);
        addToast('danger', err.message || 'Lỗi khi xóa thành viên.');
      } finally {
        setMembersLoading(false);
      }
    }
  };

  const handleBack = () => {
    navigate('/meetings');
  };

  // Helper mappings
  const getUserEmail = (userId: number) => {
    const user = allUsersList.find(u => u.id === userId);
    return user ? user.email : `Người dùng ID: ${userId}`;
  };

  const getUserUsername = (userId: number) => {
    const user = allUsersList.find(u => u.id === userId);
    return user ? user.username : 'Chưa rõ';
  };

  const getCreatorLabel = (creatorId: number) => {
    const user = allUsersList.find(u => u.id === creatorId);
    return user ? `${user.username} (${user.email})` : `ID: ${creatorId}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
              backgroundColor: toast.type === 'success' ? '#f0fdf4' : toast.type === 'danger' ? '#fef2f2' : '#eff6ff',
              color: toast.type === 'success' ? '#166534' : toast.type === 'danger' ? '#991b1b' : '#1e40af',
              borderLeft: `5px solid ${toast.type === 'success' ? 'var(--success-color)' : toast.type === 'danger' ? 'var(--danger-color)' : 'var(--primary-color)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              minWidth: '280px',
              animation: 'slideIn 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
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

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button 
          onClick={handleBack}
          className="btn btn-secondary"
          style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center' }}
          title="Quay lại danh sách"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Video size={24} />
            <span>Chi tiết cuộc họp</span>
          </h2>
          <p className="page-description">Xem chi tiết, cập nhật thông tin và quản lý thành viên tham gia cuộc họp</p>
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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải nội dung chi tiết cuộc họp...</span>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--danger-color)', backgroundColor: 'var(--danger-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>Không thể tải dữ liệu cuộc họp</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={handleBack} className="btn btn-secondary" style={{ marginTop: '1.5rem' }}>Quay lại trang danh sách</button>
        </div>
      ) : (
        // Split Column Content Layout
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
          
          {/* Column 1: Meeting Info & Updates */}
          <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Meeting Update Card */}
            <div className="card" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                Thông tin cuộc họp
              </h3>

              {actionError && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-light)', color: 'var(--danger-color)', fontSize: '0.8125rem', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '1.25rem' }}>
                  {actionError}
                </div>
              )}

              <form onSubmit={handleUpdateMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Tên/Tiêu đề cuộc họp *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    disabled={submitting}
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Mô tả cuộc họp</label>
                  <textarea 
                    className="form-input" 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    disabled={submitting}
                    style={{ minHeight: '100px', resize: 'vertical' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Trạng thái cuộc họp *</label>
                  <select 
                    className="form-input"
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

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={submitting} style={{ padding: '0.5rem 1.25rem' }}>
                    {submitting ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
                    <span>Lưu thay đổi</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Audio File Link Card */}
            <div className="card" style={{ padding: '1.5rem 2rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1rem' }}>
                Tệp âm thanh ghi âm liên kết
              </h3>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '1rem',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {meeting?.audioFile?.fileName || 'Không tìm thấy file liên kết'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Dung lượng: {formatSize(meeting?.audioFile?.fileSize)} | Trạng thái: {meeting?.audioFile?.status}
                  </span>
                </div>

                {meeting?.audioFileId && meeting?.status === 'COMPLETED' && (
                  <Link 
                    to={`/scripts/${meeting.audioFileId}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.875rem', fontSize: '0.8125rem', color: 'var(--primary-color)', borderColor: 'var(--primary-light)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <ExternalLink size={14} />
                    <span>Xem Script</span>
                  </Link>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>ID ghi âm:</span>
                  <span>{meeting?.audioFileId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Người khởi tạo cuộc họp:</span>
                  <span>{meeting ? getCreatorLabel(meeting.creatorId) : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Ngày khởi tạo:</span>
                  <span>{meeting ? new Date(meeting.createdAt).toLocaleString('vi-VN') : ''}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Members Management */}
          <div style={{ flex: 1.2, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
              
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
                  Thành viên cuộc họp ({members.length})
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Quản lý quyền truy cập và vai trò của các thành viên trong cuộc họp này
                </p>
              </div>

              {/* Add member box */}
              <div style={{ backgroundColor: 'var(--bg-main)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <UserPlus size={14} />
                  <span>Thêm thành viên mới</span>
                </h4>

                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Chọn user hệ thống</label>
                    <select
                      className="form-input"
                      value={newMemberUserId}
                      onChange={e => {
                        setNewMemberUserId(e.target.value);
                        if (e.target.value) setNewMemberEmail('');
                      }}
                      disabled={membersLoading}
                    >
                      <option value="">-- Chọn thành viên --</option>
                      {allUsersList.map(u => (
                        <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1.5, minWidth: '140px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hoặc Email</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      placeholder="vd: user@gmail.com"
                      value={newMemberEmail}
                      onChange={e => {
                        setNewMemberEmail(e.target.value);
                        if (e.target.value) setNewMemberUserId('');
                      }}
                      disabled={membersLoading}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: '100px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Vai trò</label>
                    <select 
                      className="form-input"
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value as any)}
                      disabled={membersLoading}
                    >
                      <option value="HOST">Host</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ height: '38px', whiteSpace: 'nowrap' }} disabled={membersLoading}>
                    Thêm
                  </button>
                </form>
              </div>

              {/* Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '260px' }}>
                {membersLoading && members.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem 0' }}>
                    <div className="spin-loader" />
                  </div>
                ) : members.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'white',
                          gap: '1rem',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: isHost ? 'var(--danger-light)' : 'var(--primary-light)',
                            color: isHost ? 'var(--danger-color)' : 'var(--primary-color)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {isHost ? <Crown size={14} /> : initials}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{username}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <select
                            className="form-input"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: '90px', height: '30px' }}
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
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem', color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.2)', backgroundColor: 'transparent' }}
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
};

export default MeetingDetail;
