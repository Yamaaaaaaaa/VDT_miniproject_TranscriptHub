import React, { useState, useEffect } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { api, type MeetingResponse, type UserProfileResponse } from '../services/api';
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

interface OutletContextType {
  searchQuery: string;
}

export const MeetingManagement: React.FC = () => {
  const { searchQuery } = useOutletContext<OutletContextType>();
  const navigate = useNavigate();
  
  // Lists & pagination state
  const [meetings, setMeetings] = useState<MeetingResponse[]>([]);
  const [filteredMeetings, setFilteredMeetings] = useState<MeetingResponse[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfileResponse[]>([]);
  
  const [page, setPage] = useState<number>(0);
  const [size] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modal Visibility States (only delete modal)
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [activeMeeting, setActiveMeeting] = useState<MeetingResponse | null>(null);

  // Notification Toasts
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'danger' | 'info'; message: string }>>([]);

  const addToast = (type: 'success' | 'danger' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Fetch meetings page and users
  const fetchMeetings = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      // Fetch meetings (include audio file details)
      const meetingsPage = await api.listMeetings(page, size, true, false);
      setMeetings(meetingsPage.content || []);
      setTotalPages(meetingsPage.totalPages || 0);
      setTotalElements(meetingsPage.totalElements || 0);

      // Fetch users for mapping creators
      const usersData = await api.getAllUsers();
      setAllUsersList(usersData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải danh sách cuộc họp.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [page]);

  // Filter meetings by search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredMeetings(meetings);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const filtered = meetings.filter(m => 
      m.title.toLowerCase().includes(q) || 
      (m.description && m.description.toLowerCase().includes(q)) ||
      (m.audioFile?.fileName && m.audioFile.fileName.toLowerCase().includes(q))
    );
    setFilteredMeetings(filtered);
  }, [searchQuery, meetings]);

  const handleOpenCreate = () => {
    navigate('/meetings/create');
  };

  const handleOpenDetail = (meetingId: string) => {
    navigate(`/meetings/${meetingId}`);
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
      await api.deleteMeeting(activeMeeting.id);
      setShowDeleteModal(false);
      addToast('success', 'Đã xóa cuộc họp thành công!');
      fetchMeetings(true);
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Có lỗi xảy ra khi xóa cuộc họp.');
    } finally {
      setLoading(false);
    }
  };

  const getCreatorLabel = (creatorId: number) => {
    const user = allUsersList.find(u => u.id === creatorId);
    return user ? `${user.username} (${user.email})` : `ID: ${creatorId}`;
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

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="page-title">Quản lý cuộc họp</h2>
          <p className="page-description">Lập lịch trình, quản lý thành viên tham gia cuộc họp và kết nối trực tiếp với tài liệu dịch thuật</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => fetchMeetings(true)} className="btn btn-secondary" disabled={loading}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <Plus size={14} />
            <span>Tạo cuộc họp</span>
          </button>
        </div>
      </div>

      {loading && meetings.length === 0 ? (
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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải danh sách cuộc họp...</span>
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
          <p style={{ fontWeight: 600 }}>Có lỗi khi tải dữ liệu cuộc họp:</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={() => fetchMeetings(false)} className="btn btn-danger" style={{ marginTop: '1.25rem' }}>Thử lại</button>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-controls">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Có tất cả {totalElements} cuộc họp
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tên cuộc họp</th>
                  <th>File liên kết</th>
                  <th>Người tạo</th>
                  <th>Trạng Thái</th>
                  <th>Ngày tạo</th>
                  <th style={{ textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        <Video size={48} className="table-empty-icon" style={{ strokeWidth: 1.5, color: 'var(--text-light)' }} />
                        <h4 className="table-empty-title">Chưa có cuộc họp nào</h4>
                        <p className="table-empty-desc">
                          Hãy tạo cuộc họp đầu tiên để liên kết các tệp ghi âm cuộc hội thoại và quản lý thành viên truy cập.
                        </p>
                        <button onClick={handleOpenCreate} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                          Tạo cuộc họp ngay
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredMeetings.map((m) => {
                    const audioFileName = m.audioFile?.fileName || 'Không tìm thấy file';
                    
                    return (
                      <tr key={m.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.title}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                              {m.description || 'Không có mô tả'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8125rem' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{audioFileName}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {m.audioFileId.slice(0, 8)}...</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>
                          {getCreatorLabel(m.creatorId)}
                        </td>
                        <td>
                          {m.status === 'COMPLETED' ? (
                            <span className="badge badge-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <CheckCircle2 size={12} />
                              <span>Hoàn tất</span>
                            </span>
                          ) : m.status === 'PROCESSING' ? (
                            <span className="badge badge-manager" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fefce8', color: '#b45309' }}>
                              <Loader2 className="spin" size={12} />
                              <span>Đang xử lý</span>
                            </span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                              Khởi tạo
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {new Date(m.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {m.audioFileId && m.status === 'COMPLETED' && (
                              <Link 
                                to={`/scripts/${m.audioFileId}`}
                                className="btn btn-secondary"
                                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: 'var(--primary-color)', borderColor: 'var(--primary-light)' }}
                                title="Xem bản dịch text & timeline âm thanh"
                              >
                                <ExternalLink size={12} />
                                <span>Xem Script</span>
                              </Link>
                            )}
                            
                            <button 
                              onClick={() => handleOpenDetail(m.id)}
                              className="btn btn-secondary"
                              style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                              title="Xem chi tiết & Quản lý thành viên"
                            >
                              <Info size={12} />
                              <span>Chi tiết</span>
                            </button>

                            <button 
                              onClick={() => handleOpenDelete(m)}
                              className="btn btn-secondary"
                              style={{ padding: '0.375rem', borderRadius: '4px', color: 'var(--danger-color)' }}
                              title="Xóa cuộc họp"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', padding: '0 0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Trang {page + 1} / {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button 
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  className="btn btn-secondary"
                  disabled={page === 0}
                  style={{ padding: '0.375rem' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                  className="btn btn-secondary"
                  disabled={page === totalPages - 1}
                  style={{ padding: '0.375rem' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={{ ...modalCardStyle, maxWidth: '420px' }}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--danger-color)' }}>Xác nhận xóa cuộc họp</h3>
              <button onClick={() => setShowDeleteModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0.5rem 0' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                Bạn có chắc chắn muốn xóa cuộc họp <strong>"{activeMeeting?.title}"</strong> không? 
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hành động này sẽ xóa vĩnh viễn thông tin lịch trình cuộc họp và quyền truy cập của các thành viên. Tệp ghi âm liên kết và bản dịch gốc sẽ không bị ảnh hưởng.
              </p>
            </div>

            {actionError && (
              <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-light)', color: 'var(--danger-color)', fontSize: '0.75rem' }}>
                {actionError}
              </div>
            )}

            <div style={modalFooterStyle}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Hủy bỏ
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteMeeting} disabled={loading}>
                {loading && <Loader2 className="spin" size={14} />}
                <span>Xóa vĩnh viễn</span>
              </button>
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
      `}</style>
    </div>
  );
};

// Modal Inline Styles
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
  maxWidth: '560px',
  backgroundColor: 'white',
  boxShadow: 'var(--shadow-lg), 0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  borderRadius: 'var(--radius-xl)',
  padding: '2rem',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '1rem',
  marginBottom: '0.5rem'
};

const modalCloseBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-light)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.25rem',
  borderRadius: 'var(--radius-sm)'
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '1.25rem',
  marginTop: '1rem'
};

export default MeetingManagement;
