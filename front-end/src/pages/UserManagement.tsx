import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, type UserProfileResponse, type RoleResponse } from '../services/api';
import { 
  RefreshCw, 
  UserX, 
  Calendar, 
  Phone, 
  MapPin, 
  Edit2, 
  Trash2, 
  UserPlus, 
  X, 
  Lock
} from 'lucide-react';

interface OutletContextType {
  searchQuery: string;
}

export const UserManagement = () => {
  const { searchQuery } = useOutletContext<OutletContextType>();
  
  const [users, setUsers] = useState<UserProfileResponse[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfileResponse[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleResponse[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Create Form State
  const [cUsername, setCUsername] = useState<string>('');
  const [cEmail, setCEmail] = useState<string>('');
  const [cPassword, setCPassword] = useState<string>('');
  const [cFirstName, setCFirstName] = useState<string>('');
  const [cLastName, setCLastName] = useState<string>('');
  const [cDob, setCDob] = useState<string>('');
  const [cCity, setCCity] = useState<string>('');

  // Edit Form State
  const [eId, setEId] = useState<number>(0);
  const [eUsername, setEUsername] = useState<string>('');
  const [eEmail, setEEmail] = useState<string>('');
  const [ePassword, setEPassword] = useState<string>('');
  const [eFirstName, setEFirstName] = useState<string>('');
  const [eLastName, setELastName] = useState<string>('');
  const [eDob, setEDob] = useState<string>('');
  const [eRoles, setERoles] = useState<string[]>([]);

  // Delete Form State
  const [dId, setDId] = useState<number>(0);
  const [dUsername, setDUsername] = useState<string>('');
  const [dEmail, setDEmail] = useState<string>('');

  const fetchUsersAndRoles = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    
    setError('');
    try {
      // Fetch profiles from user-service, identity records from identity-service, and roles list
      const [profiles, identityPage, rolesList] = await Promise.all([
        api.getAllUsers(),
        api.getAllIdentityUsers(),
        api.getAllRoles()
      ]);

      setAvailableRoles(rolesList);

      const identityUsers = identityPage.content || [];
      
      // Merge users: prioritize identity service records and attach profile fields
      const mergedList = identityUsers.map(i => {
        const profile = profiles.find(p => p.email.toLowerCase() === i.email.toLowerCase());
        return {
          id: i.id,
          username: i.username,
          email: i.email,
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          dob: profile?.dob || '',
          phone: profile?.phone || '',
          city: profile?.city || '',
          roles: i.roles.map(r => r.name)
        };
      });

      setUsers(mergedList);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải thông tin người dùng từ máy chủ.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsersAndRoles();
  }, []);

  // Filter list when search changes
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

  // Actions
  const handleOpenCreate = () => {
    setActionError('');
    setCUsername('');
    setCEmail('');
    setCPassword('');
    setCFirstName('');
    setCLastName('');
    setCDob('');
    setCCity('');
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    
    if (!cUsername || !cEmail || !cPassword) {
      setActionError('Tên đăng nhập, email và mật khẩu là bắt buộc.');
      return;
    }

    try {
      await api.adminCreateUser({
        username: cUsername,
        password: cPassword,
        email: cEmail,
        firstName: cFirstName,
        lastName: cLastName,
        dob: cDob || null,
        city: cCity
      });
      setShowCreateModal(false);
      fetchUsersAndRoles(true);
    } catch (err: any) {
      setActionError(err.message || 'Đăng ký người dùng mới thất bại.');
    }
  };

  const handleOpenEdit = (u: UserProfileResponse) => {
    if (u.email === 'admin@gmail.com') {
      alert('Tài khoản quản trị hệ thống mặc định (admin@gmail.com) đã bị khóa, không thể chỉnh sửa.');
      return;
    }
    setActionError('');
    setEId(u.id);
    setEUsername(u.username);
    setEEmail(u.email);
    setEPassword('');
    setEFirstName(u.firstName || '');
    setELastName(u.lastName || '');
    setEDob(u.dob || '');
    setERoles(u.roles || []);
    setShowEditModal(true);
  };

  const handleToggleRoleCheckbox = (roleName: string) => {
    setERoles(prev => 
      prev.includes(roleName) 
        ? prev.filter(r => r !== roleName) 
        : [...prev, roleName]
    );
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');

    try {
      await api.adminUpdateUser(eId, {
        password: ePassword || null,
        firstName: eFirstName,
        lastName: eLastName,
        dob: eDob || null,
        roles: eRoles
      });
      setShowEditModal(false);
      fetchUsersAndRoles(true);
    } catch (err: any) {
      setActionError(err.message || 'Cập nhật thông tin người dùng thất bại.');
    }
  };

  const handleOpenDelete = (u: UserProfileResponse) => {
    if (u.email === 'admin@gmail.com') {
      alert('Tài khoản quản trị hệ thống mặc định (admin@gmail.com) đã bị khóa, không thể xóa.');
      return;
    }
    setActionError('');
    setDId(u.id);
    setDUsername(u.username);
    setDEmail(u.email);
    setShowDeleteModal(true);
  };

  const handleDeleteUser = async () => {
    setActionError('');
    try {
      await api.adminDeleteUser(dId);
      setShowDeleteModal(false);
      fetchUsersAndRoles(true);
    } catch (err: any) {
      setActionError(err.message || 'Xóa người dùng thất bại.');
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="page-title">Quản lý người dùng</h2>
          <p className="page-description">Quản lý thông tin tài khoản, hồ sơ cá nhân và phân quyền hệ thống</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={handleOpenCreate} 
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserPlus size={16} />
            <span>Thêm người dùng</span>
          </button>
          
          <button 
            onClick={() => fetchUsersAndRoles(true)} 
            className="btn btn-secondary" 
            disabled={loading || refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
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
          <button onClick={() => fetchUsersAndRoles()} className="btn btn-danger" style={{ marginTop: '1rem' }}>Thử lại</button>
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
                    const isAdminEmail = u.email === 'admin@gmail.com';
                    
                    return (
                      <tr key={u.id} style={isAdminEmail ? { backgroundColor: '#fdfdfd', opacity: 0.9 } : {}}>
                        <td>
                          <div className="user-cell">
                            <div className={`user-cell-avatar ${isAdminEmail ? 'admin-avatar' : ''}`}>
                              {getInitials(u)}
                            </div>
                            <div className="user-cell-info">
                              <span className="user-cell-name" style={isAdminEmail ? { color: 'var(--text-muted)' } : {}}>{u.username}</span>
                              <span className="user-cell-username">ID: {u.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span>{u.email}</span>
                            {isAdminEmail && (
                              <span title="Tài khoản hệ thống bảo mật" style={{ display: 'inline-flex' }}>
                                <Lock size={12} style={{ color: 'var(--danger-color)' }} />
                              </span>
                            )}
                          </div>
                        </td>
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
                          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                            {isAdminEmail ? (
                              <>
                                <button 
                                  disabled
                                  className="btn btn-secondary"
                                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', opacity: 0.5, cursor: 'not-allowed' }}
                                  title="Không thể chỉnh sửa tài khoản hệ thống"
                                >
                                  <Edit2 size={12} />
                                  <span>Sửa</span>
                                </button>
                                <button 
                                  disabled
                                  className="btn btn-secondary"
                                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', opacity: 0.5, cursor: 'not-allowed' }}
                                  title="Không thể xóa tài khoản hệ thống"
                                >
                                  <Trash2 size={12} />
                                  <span>Xóa</span>
                                </button>
                                <span className="badge badge-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                                  <Lock size={10} />
                                  <span>Hệ thống (Khóa)</span>
                                </span>
                              </>
                            ) : (
                              <>
                                <button 
                                  onClick={() => handleOpenEdit(u)} 
                                  className="btn btn-secondary"
                                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                                  title="Chỉnh sửa thông tin và vai trò"
                                >
                                  <Edit2 size={12} />
                                  <span>Sửa</span>
                                </button>
                                <button 
                                  onClick={() => handleOpenDelete(u)} 
                                  className="btn btn-secondary"
                                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: 'var(--danger-color)', borderColor: 'rgba(239,68,68,0.2)' }}
                                  title="Xóa người dùng"
                                >
                                  <Trash2 size={12} />
                                  <span>Xóa</span>
                                </button>
                                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  {u.roles && u.roles.length > 0 ? (
                                    u.roles.map(roleName => {
                                      const isSysAdmin = roleName === 'ADMIN' || roleName === 'ADMIN_LOGIN';
                                      return (
                                        <span 
                                          key={roleName} 
                                          className={`badge ${isSysAdmin ? 'badge-admin' : 'badge-user'}`}
                                          style={{ fontSize: '0.6875rem', padding: '0.1rem 0.375rem' }}
                                        >
                                          {roleName}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="badge badge-user" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.375rem', backgroundColor: '#f1f5f9', color: '#475569' }}>
                                      Không có Role
                                    </span>
                                  )}
                                </div>
                              </>
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

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Thêm người dùng mới</h3>
              <button onClick={() => setShowCreateModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} style={modalFormStyle}>
              <div style={formRowStyle}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tên đăng nhập *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="vd: user123"
                    value={cUsername}
                    onChange={e => setCUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Địa chỉ Email *</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="ten@gmail.com"
                    value={cEmail}
                    onChange={e => setCEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Mật khẩu ban đầu *</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Tối thiểu 6 ký tự"
                  value={cPassword}
                  onChange={e => setCPassword(e.target.value)}
                  required
                />
              </div>

              <div style={formRowStyle}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Họ (First Name)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="vd: Nguyễn"
                    value={cFirstName}
                    onChange={e => setCFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tên (Last Name)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="vd: Văn A"
                    value={cLastName}
                    onChange={e => setCLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={formRowStyle}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Ngày sinh</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={cDob}
                    onChange={e => setCDob(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Thành phố</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="vd: Hà Nội"
                    value={cCity}
                    onChange={e => setCCity(e.target.value)}
                  />
                </div>
              </div>

              <div style={modalFooterStyle}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary">
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER & ROLES MODAL */}
      {showEditModal && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>Cập nhật người dùng</h3>
              <button onClick={() => setShowEditModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleEditUser} style={modalFormStyle}>
              <div style={formRowStyle}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tên đăng nhập</label>
                  <input type="text" className="form-input" value={eUsername} disabled style={{ backgroundColor: 'var(--bg-main)', cursor: 'not-allowed', color: 'var(--text-muted)' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Địa chỉ Email</label>
                  <input type="email" className="form-input" value={eEmail} disabled style={{ backgroundColor: 'var(--bg-main)', cursor: 'not-allowed', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Đổi mật khẩu mới (Để trống nếu giữ nguyên)</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Nhập mật khẩu mới nếu muốn thay đổi"
                  value={ePassword}
                  onChange={e => setEPassword(e.target.value)}
                />
              </div>

              <div style={formRowStyle}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Họ (First Name)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={eFirstName}
                    onChange={e => setEFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tên (Last Name)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={eLastName}
                    onChange={e => setELastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ngày sinh</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={eDob}
                  onChange={e => setEDob(e.target.value)}
                />
              </div>

              {/* Roles Selection Checklist */}
              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '0.5rem' }}>Phân Quyền Vai Trò (Roles) *</label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  maxHeight: '160px',
                  overflowY: 'auto'
                }}>
                  {availableRoles.map(role => (
                    <label 
                      key={role.name} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={eRoles.includes(role.name)}
                        onChange={() => handleToggleRoleCheckbox(role.name)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={modalFooterStyle}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary">
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRM MODAL */}
      {showDeleteModal && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={{ ...modalCardStyle, maxWidth: '400px' }}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={20} />
                <span>Xác nhận xóa tài khoản</span>
              </h3>
              <button onClick={() => setShowDeleteModal(false)} style={modalCloseBtnStyle}>
                <X size={18} />
              </button>
            </div>
            
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <span>{actionError}</span>
              </div>
            )}

            <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn xóa tài khoản người dùng <strong>{dUsername}</strong> (Email: <code>{dEmail}</code>)?<br />
              <span style={{ color: 'var(--danger-color)', fontWeight: 600, display: 'block', marginTop: '0.5rem' }}>
                * Hành động này không thể hoàn tác và sẽ xóa bỏ vĩnh viễn tài khoản khỏi cơ sở dữ liệu.
              </span>
            </div>

            <div style={modalFooterStyle}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Hủy bỏ
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteUser}>
                Đồng ý xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Utility for spinners */}
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

// Modal Inline Styles for Self-Containment
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

const modalFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem'
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  width: '100%'
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '1.25rem',
  marginTop: '1rem'
};

export default UserManagement;
