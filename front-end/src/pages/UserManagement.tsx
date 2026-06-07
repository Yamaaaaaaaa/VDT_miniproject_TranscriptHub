import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, type UserProfileResponse } from '../services/api';
import { 
  RefreshCw, 
  UserX, 
  Calendar, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  UserCheck,
  Edit2
} from 'lucide-react';

interface OutletContextType {
  searchQuery: string;
}

export const UserManagement = () => {
  const { searchQuery } = useOutletContext<OutletContextType>();
  
  const [users, setUsers] = useState<UserProfileResponse[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfileResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchUsers = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    
    setError('');
    try {
      const data = await api.getAllUsers();
      setUsers(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filter users when search query or user list changes
  useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers(users);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = users.filter(u => {
      const fullname = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return (
        u.username.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        fullname.includes(query) ||
        (u.city && u.city.toLowerCase().includes(query)) ||
        (u.phone && u.phone.includes(query))
      );
    });
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  const getInitials = (u: UserProfileResponse) => {
    const name = u.firstName || u.username || u.email;
    return name.slice(0, 2).toUpperCase();
  };

  const handleEditUser = (u: UserProfileResponse) => {
    alert(`Chức năng chỉnh sửa thông tin người dùng "${u.username}" đang được phát triển.`);
  };



  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Quản lý người dùng</h2>
          <p className="page-description">Quản lý thông tin tài khoản, hồ sơ cá nhân và phân quyền hệ thống</p>
        </div>
        
        <button 
          onClick={() => fetchUsers(true)} 
          className="btn btn-secondary" 
          disabled={loading || refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Main Table Layout */}
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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Đang tải danh sách người dùng...</span>
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
          <p style={{ fontWeight: 600 }}>Lỗi xảy ra:</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>
          <button onClick={() => fetchUsers()} className="btn btn-danger" style={{ marginTop: '1rem' }}>Thử lại</button>
        </div>
      ) : (
        <div className="table-container">
          {searchQuery && (
            <div style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--primary-light)', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem', color: 'var(--primary-color)' }}>
              Kết quả tìm kiếm cho: <strong>"{searchQuery}"</strong> ({filteredUsers.length} người dùng)
            </div>
          )}
          
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Địa chỉ Email</th>
                  <th>Họ và Tên</th>
                  <th>Ngày sinh / SĐT</th>
                  <th>Thành phố</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        <UserX className="table-empty-icon" />
                        <h4 className="table-empty-title">Không tìm thấy người dùng</h4>
                        <p className="table-empty-desc">
                          {searchQuery ? 'Không có hồ sơ nào khớp với từ khóa tìm kiếm của bạn.' : 'Hiện tại chưa có người dùng nào được khởi tạo trong cơ sở dữ liệu.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    // Check if they are admin based on username or mock rules (since user-service doesn't store role)
                    const isUserAdmin = u.username === 'admin' || u.email.startsWith('admin@');
                    
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="user-cell">
                            <div className={`user-cell-avatar ${isUserAdmin ? 'admin-avatar' : ''}`}>
                              {getInitials(u)}
                            </div>
                            <div className="user-cell-info">
                              <span className="user-cell-name">{u.username}</span>
                              <span className="user-cell-username">ID: {u.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>{u.email}</td>
                        <td>
                          {u.firstName || u.lastName ? (
                            <span style={{ fontWeight: 500 }}>{`${u.firstName || ''} ${u.lastName || ''}`.trim()}</span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>Chưa cập nhật</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8125rem' }}>
                            {u.dob ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-main)' }}>
                                <Calendar size={12} className="text-muted" />
                                {new Date(u.dob).toLocaleDateString('vi-VN')}
                              </span>
                            ) : null}
                            {u.phone ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)' }}>
                                <Phone size={12} />
                                {u.phone}
                              </span>
                            ) : (
                              u.dob ? null : <span className="text-muted" style={{ fontStyle: 'italic' }}>Chưa cập nhật</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {u.city ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <MapPin size={12} className="text-muted" />
                              {u.city}
                            </span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>Chưa cập nhật</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              onClick={() => handleEditUser(u)} 
                              className="btn btn-secondary"
                              style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                              title="Chỉnh sửa thông tin"
                            >
                              <Edit2 size={12} />
                              <span>Sửa</span>
                            </button>
                            
                            {isUserAdmin && (
                              <span className="badge badge-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <ShieldCheck size={12} />
                                <span>Admin</span>
                              </span>
                            )}
                            {!isUserAdmin && (
                              <span className="badge badge-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <UserCheck size={12} />
                                <span>User</span>
                              </span>
                            )}
                          </div>
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

      {/* Loading animation utility */}
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
export default UserManagement;
